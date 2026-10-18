import { ExamDocumentService } from './exam-document.service';
import { TeacherWorkspaceService } from './teacher-workspace.service';
import { ExamAiService } from './exam-ai.service';
import { AiBudgetService } from '../ai/ai-budget.service';
import { Module } from '@nestjs/common';
import { AssignmentController } from './assignment.controller';
import { AssignmentService } from './assignment.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AssignmentController],
  providers: [ExamDocumentService, TeacherWorkspaceService, AssignmentService, ExamAiService, AiBudgetService],
  exports: [AssignmentService]
})
export class AssignmentModule {}
