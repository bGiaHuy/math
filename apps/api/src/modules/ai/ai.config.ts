export const mwapiToken = (env: Record<string, string | undefined> = process.env) => (env.MATH_MWAPI_AUTH_TOKEN || env.ANTHROPIC_AUTH_TOKEN || '').trim();
const number = (env: Record<string, string | undefined>, key: string, fallback: number, max: number) => {
  const value = env[key] === undefined || env[key] === '' ? fallback : Number(env[key]);
  if (!Number.isFinite(value) || value <= 0 || value > max) throw new Error(`Invalid ${key}.`);
  return value;
};

export function aiConfig(env: Record<string, string | undefined> = process.env) {
  const model = env.AI_MODEL || 'claude-haiku-4-5-20251001';
  const provider = env.AI_PROVIDER || 'anthropic';
  if (!['anthropic', 'mwapi'].includes(provider)) throw new Error('Invalid AI_PROVIDER.');
  const prices = {
    'claude-haiku-4-5-20251001': { input: 1, output: 5 },
    'claude-sonnet-4-6': { input: 3, output: 15 }
  };
  if (!Object.prototype.hasOwnProperty.call(prices, model)) throw new Error('AI_MODEL must use an explicitly priced model.');
  const enabled = env.AI_ENABLED === 'true';
  const secret = provider === 'mwapi' ? mwapiToken(env) : env.ANTHROPIC_API_KEY;
  if (enabled && !secret?.trim()) throw new Error('Missing server-side AI credential.');
  if (enabled && provider === 'mwapi' && (!env.AI_INPUT_USD_PER_MILLION || !env.AI_OUTPUT_USD_PER_MILLION)) {
    throw new Error('MWAPI requires explicit provider token prices for budget accounting.');
  }
  const modelPrices = prices[model] as { input: number; output: number };
  return {
    enabled: enabled && Boolean(secret?.trim()), provider,
    endpoint: provider === 'mwapi' ? 'https://api.mwapi.dev/v1/messages' : 'https://api.anthropic.com/v1/messages',
    model, prices: provider === 'mwapi' ? {
      input: number(env, 'AI_INPUT_USD_PER_MILLION', modelPrices.input, 1000),
      output: number(env, 'AI_OUTPUT_USD_PER_MILLION', modelPrices.output, 1000)
    } : modelPrices,
    lifetimeUsd: number(env, 'AI_LIFETIME_BUDGET_USD', 90, 100000),
    monthlyUsd: number(env, 'AI_MONTHLY_BUDGET_USD', 30, 100000),
    dailyUsd: number(env, 'AI_DAILY_BUDGET_USD', 5, 10000),
    userDailyUsd: number(env, 'AI_USER_DAILY_BUDGET_USD', 0.15, 100),
    dailyRequests: number(env, 'AI_USER_DAILY_REQUESTS', 40, 1000),
    perMinute: number(env, 'AI_USER_REQUESTS_PER_MINUTE', 6, 100),
    ipPerMinute: number(env, 'AI_IP_REQUESTS_PER_MINUTE', 30, 1000),
    concurrency: number(env, 'AI_MAX_CONCURRENT_REQUESTS', 4, 100),
    timeoutMs: 45000
  };
}

export const aiError = (code: string, message: string) => ({ code, message });
