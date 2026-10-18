import { HttpException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { aiConfig, aiError } from './ai.config';

export const AI_BUDGET_LOCK = 610062026;
export const budgetCharge = (row: { costUsd: number; reservedUsd: number }) => row.costUsd + row.reservedUsd;
export const utcPeriods = (now: Date) => ({
  day: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
  month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  minute: new Date(now.getTime() - 60000), active: new Date(now.getTime() - 360000)
});

@Injectable()
export class AiBudgetService {
  constructor(private readonly prisma: PrismaService) {}

  async reserve(data: { userId: string; ipHash: string; task: string; model: string; reservedUsd: number;
    id?: string; lessonId?: string; conversationId?: string; message?: string }) {
    const config = aiConfig();
    // Teacher document authoring has no application quota. Keep the usage ledger,
    // but do not admit it through student tutoring budgets or rate counters.
    if (data.task === 'TEACHER_EXAM') return this.prisma.aiRequest.create({ data });
    return this.prisma.$transaction(async tx => {
      // Serialize admission across every API instance, not just the current process.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${AI_BUDGET_LOCK})::text`;
      if (data.id && await tx.aiRequest.findUnique({ where: { id: data.id } })) {
        throw new HttpException(aiError('AI_REQUEST_EXISTS', 'Yêu cầu đã được ghi nhận. Hãy tải lại lịch sử.'), 409);
      }
      const now = new Date(), period = utcPeriods(now);
      const sum = async (where: any) => {
        const aggregate = await tx.aiRequest.aggregate({ where, _sum: { costUsd: true, reservedUsd: true } });
        return (aggregate._sum.costUsd || 0) + (aggregate._sum.reservedUsd || 0);
      };
      const [lifetime, month, day, userDay, requests, minute, ipMinute, concurrent, userConcurrent] = await Promise.all([
        sum({}), sum({ createdAt: { gte: period.month } }), sum({ createdAt: { gte: period.day } }),
        sum({ userId: data.userId, createdAt: { gte: period.day } }),
        tx.aiRequest.count({ where: { userId: data.userId, createdAt: { gte: period.day } } }),
        tx.aiRequest.count({ where: { userId: data.userId, createdAt: { gte: period.minute } } }),
        tx.aiRequest.count({ where: { ipHash: data.ipHash, createdAt: { gte: period.minute } } }),
        tx.aiRequest.count({ where: { status: 'RESERVED', createdAt: { gte: period.active } } }),
        tx.aiRequest.count({ where: { userId: data.userId, status: 'RESERVED', createdAt: { gte: period.active } } })
      ]);
      if (lifetime + data.reservedUsd > config.lifetimeUsd || month + data.reservedUsd > config.monthlyUsd ||
          day + data.reservedUsd > config.dailyUsd) {
        throw new HttpException(aiError('AI_BUDGET_EXHAUSTED', 'AI đã đạt hạn mức ngân sách. Bạn vẫn có thể học các bài có sẵn.'), 429);
      }
      if (userDay + data.reservedUsd > config.userDailyUsd || requests >= config.dailyRequests) {
        throw new HttpException(aiError('AI_USER_LIMIT', 'Bạn đã dùng hết lượt AI hôm nay. Hãy tiếp tục với bài học có sẵn.'), 429);
      }
      if (minute >= config.perMinute || ipMinute >= config.ipPerMinute || concurrent >= config.concurrency || userConcurrent > 0) {
        throw new HttpException(aiError('AI_RATE_LIMIT', 'AI đang xử lý yêu cầu. Hãy chờ một chút rồi thử lại.'), 429);
      }
      return tx.aiRequest.create({ data });
    });
  }

  async settle(id: string, inputTokens: number, outputTokens: number, result: any) {
    const { prices } = aiConfig();
    const costUsd = (inputTokens * prices.input + outputTokens * prices.output) / 1000000;
    await this.prisma.aiRequest.update({ where: { id }, data: {
      status: 'COMPLETED', reservedUsd: 0, inputTokens, outputTokens, costUsd, result
    } });
    return costUsd;
  }

  async fail(id: string, definitelyNotBilled: boolean) {
    await this.prisma.aiRequest.update({ where: { id }, data: {
      status: definitelyNotBilled ? 'FAILED' : 'UNCERTAIN', ...(definitelyNotBilled ? { reservedUsd: 0 } : {})
    } });
  }

  async usage(userId: string, admin: boolean) {
    const config = aiConfig(), period = utcPeriods(new Date());
    const where = { userId, createdAt: { gte: period.day } };
    const [usage, requests] = await Promise.all([
      this.prisma.aiRequest.aggregate({ where, _sum: { costUsd: true, reservedUsd: true, inputTokens: true, outputTokens: true } }),
      this.prisma.aiRequest.count({ where })
    ]);
    const used = (usage._sum.costUsd || 0) + (usage._sum.reservedUsd || 0);
    const result: any = { enabled: config.enabled, requestsToday: requests, dailyRequestLimit: config.dailyRequests,
      mode: process.env.NODE_ENV !== 'production' && (process.env.AI_DEMO_MODE === 'true' || process.execArgv.some(arg => arg.endsWith('mock-claude.cjs'))) ? 'demo' : 'live',
      remainingRequests: Math.max(0, config.dailyRequests - requests), budgetRemaining: used < config.userDailyUsd,
      inputTokens: usage._sum.inputTokens || 0, outputTokens: usage._sum.outputTokens || 0 };
    if (admin) {
      const totals = await this.prisma.aiRequest.aggregate({ _sum: { costUsd: true, reservedUsd: true } });
      const month = await this.prisma.aiRequest.aggregate({ where: { createdAt: { gte: period.month } }, _sum: { costUsd: true, reservedUsd: true } });
      result.budget = { spentUsd: totals._sum.costUsd || 0, reservedUsd: totals._sum.reservedUsd || 0,
        lifetimeLimitUsd: config.lifetimeUsd, monthlyLimitUsd: config.monthlyUsd,
        monthlyUsedUsd: (month._sum.costUsd || 0) + (month._sum.reservedUsd || 0),
        alert: ((totals._sum.costUsd || 0) + (totals._sum.reservedUsd || 0)) >= config.lifetimeUsd * 0.8 };
    }
    return result;
  }
}
