import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AssignmentService } from './assignment.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { SubmitAssignmentDto } from './dto/submit-assignment.dto';
import { RandomExamDto } from './dto/random-exam.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Classroom Assignments & Exams')
@Controller()
@UseGuards(AuthGuard, RolesGuard)
@ApiBearerAuth()
export class AssignmentController {
  constructor(private readonly assignmentService: AssignmentService) {}

  @Post('assignments/random-preview')
  @Roles(UserRole.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Chọn ngẫu nhiên câu hỏi từ ngân hàng để xem trước đề' })
  randomPreview(@CurrentUser('id') teacherId: string, @Body() dto: RandomExamDto) {
    return this.assignmentService.randomPreview(teacherId, dto);
  }

  // ==========================================
  // TEACHER ROUTES
  // ==========================================

  @Post('classrooms/:classId/assignments')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên tạo đề thi / bài tập mới cho lớp học' })
  @ApiResponse({ status: 201, description: 'Tạo đề thi thành công' })
  async createAssignment(
    @CurrentUser('id') teacherId: string,
    @CurrentUser('role') role: UserRole,
    @Param('classId') classId: string,
    @Body() dto: CreateAssignmentDto
  ) {
    return this.assignmentService.createAssignment(teacherId, classId, dto, role);
  }

  @Get('classrooms/:classId/assignments')
  @Roles(UserRole.TEACHER, UserRole.STUDENT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách đề thi / bài tập của lớp học' })
  @ApiResponse({ status: 200, description: 'Danh sách bài tập của lớp' })
  async getClassAssignments(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
    @Param('classId') classId: string
  ) {
    const isTeacher = role === UserRole.TEACHER || role === UserRole.ADMIN;
    return this.assignmentService.getClassAssignments(userId, classId, isTeacher, role);
  }

  @Get('classrooms/:classId/assignments/:assignmentId/submissions')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Giáo viên xem bảng điểm và phân tích câu hỏi của lớp cho đề thi này' })
  @ApiResponse({ status: 200, description: 'Bảng điểm và phân tích câu hỏi' })
  async getAssignmentSubmissions(
    @CurrentUser('id') teacherId: string,
    @CurrentUser('role') role: UserRole,
    @Param('classId') classId: string,
    @Param('assignmentId') assignmentId: string
  ) {
    return this.assignmentService.getAssignmentSubmissionsForTeacher(teacherId, classId, assignmentId, role);
  }

  @Delete('classrooms/:classId/assignments/:assignmentId')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên xóa đề thi của lớp' })
  @ApiResponse({ status: 200, description: 'Xóa đề thi thành công' })
  async deleteAssignment(
    @CurrentUser('id') teacherId: string,
    @CurrentUser('role') role: UserRole,
    @Param('classId') classId: string,
    @Param('assignmentId') assignmentId: string
  ) {
    return this.assignmentService.deleteAssignment(teacherId, classId, assignmentId, role);
  }

  @Get('assignments/sample-template')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy định dạng đề thi mẫu chuẩn GDPT 2018 (JSON) để kết hợp cùng AI prompt' })
  @ApiResponse({ status: 200, description: 'Cấu trúc đề thi mẫu' })
  async getSampleExamTemplate() {
    return this.assignmentService.getSampleExamTemplate();
  }

  // ==========================================
  // STUDENT ROUTES
  // ==========================================

  @Get('assignments/:id/take')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Học sinh lấy nội dung đề thi để làm bài (ẩn đáp án đúng)' })
  @ApiResponse({ status: 200, description: 'Nội dung đề thi' })
  async getAssignmentForTaking(
    @CurrentUser('id') studentId: string,
    @Param('id') assignmentId: string
  ) {
    return this.assignmentService.getAssignmentForTaking(studentId, assignmentId);
  }

  @Post('assignments/:id/draft')
  @Roles(UserRole.STUDENT)
  async saveDraft(@CurrentUser('id') studentId:string, @Param('id') assignmentId:string, @Body() dto:SubmitAssignmentDto) { return this.assignmentService.saveDraft(studentId,assignmentId,dto); }

  @Post('assignments/:id/submit')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Học sinh nộp bài thi — Tự động chấm điểm' })
  @ApiResponse({ status: 200, description: 'Nộp bài thi thành công' })
  async submitAssignment(
    @CurrentUser('id') studentId: string,
    @Param('id') assignmentId: string,
    @Body() dto: SubmitAssignmentDto
  ) {
    return this.assignmentService.submitAssignment(studentId, assignmentId, dto);
  }

  @Get('assignments/:id/result')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Học sinh xem kết quả bài làm và lời giải chi tiết' })
  @ApiResponse({ status: 200, description: 'Kết quả bài thi chi tiết' })
  async getStudentAssignmentResult(
    @CurrentUser('id') studentId: string,
    @Param('id') assignmentId: string
  ) {
    return this.assignmentService.getStudentAssignmentResult(studentId, assignmentId);
  }
}
