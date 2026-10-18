import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { ReviewQuestionDto } from './dto/review-question.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole, QuestionStatus, UserStatus } from '@prisma/client';

@ApiTags('Admin, Content Workflow & Governance')
@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Xem tổng quan thống kê số liệu toàn hệ thống' })
  @ApiResponse({ status: 200, description: 'Chỉ số thống kê hệ thống' })
  async getSystemOverview() {
    return this.adminService.getSystemOverview();
  }

  @Get('questions')
  @Roles(UserRole.ADMIN, UserRole.CONTENT_AUTHOR, UserRole.CONTENT_REVIEWER, UserRole.TEACHER)
  @ApiOperation({ summary: 'Lấy danh sách câu hỏi trong ngân hàng theo trạng thái' })
  @ApiQuery({ name: 'status', required: false, enum: QuestionStatus })
  @ApiQuery({ name: 'skillId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Danh sách câu hỏi' })
  async getQuestions(
    @Query('status') status?: QuestionStatus,
    @Query('skillId') skillId?: string,
    @CurrentUser('id') userId?: string,
    @CurrentUser('role') role?: UserRole,
    @Query('questionType') questionType?: string,
    @Query('difficulty') difficulty?: string
  ) {
    return this.adminService.getQuestions(status, skillId, userId, role, questionType, difficulty);
  }

  @Post('questions')
  @Roles(UserRole.ADMIN, UserRole.CONTENT_AUTHOR)
  @ApiOperation({ summary: 'Tạo câu hỏi mới (mặc định trạng thái DRAFT)' })
  @ApiResponse({ status: 201, description: 'Tạo câu hỏi thành công' })
  async createQuestion(
    @CurrentUser('id') authorId: string,
    @Body() dto: CreateQuestionDto
  ) {
    return this.adminService.createQuestion(authorId, dto);
  }

  @Patch('questions/:questionId/review')
  @Roles(UserRole.ADMIN, UserRole.CONTENT_REVIEWER, UserRole.CONTENT_AUTHOR)
  @ApiOperation({ summary: 'Thẩm định & duyệt câu hỏi (Bắt buộc tuân thủ quy tắc Maker-Checker)' })
  @ApiResponse({ status: 200, description: 'Cập nhật trạng thái câu hỏi' })
  async reviewQuestion(
    @CurrentUser('id') reviewerId: string,
    @Param('questionId') questionId: string,
    @Body() dto: ReviewQuestionDto
  ) {
    return this.adminService.reviewQuestion(reviewerId, questionId, dto);
  }

  @Patch('questions/:questionId/difficulty')
  @Roles(UserRole.ADMIN, UserRole.TEACHER, UserRole.CONTENT_AUTHOR)
  async setQuestionDifficulty(@CurrentUser('id') userId: string, @CurrentUser('role') role: UserRole,
    @Param('questionId') questionId: string, @Body('difficulty') difficulty: string) {
    return this.adminService.setQuestionDifficulty(userId, role, questionId, difficulty);
  }

  @Patch('questions/:questionId/labels')
  @Roles(UserRole.ADMIN, UserRole.TEACHER, UserRole.CONTENT_AUTHOR)
  async setQuestionLabels(@CurrentUser('id') userId: string, @CurrentUser('role') role: UserRole,
    @Param('questionId') questionId: string, @Body() labels: { skillId: string; difficulty: string }) {
    return this.adminService.setQuestionLabels(userId, role, questionId, labels);
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Xem nhật ký kiểm toán hệ thống (Audit Logs)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Danh sách nhật ký kiểm toán' })
  async getAuditLogs(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.adminService.getAuditLogs(isNaN(limitNum) ? 50 : limitNum);
  }

  @Get('users')
  @ApiOperation({ summary: 'Quản lý người dùng: Lấy danh sách tài khoản toàn hệ thống' })
  @ApiQuery({ name: 'role', required: false, enum: UserRole })
  @ApiQuery({ name: 'status', required: false, enum: UserStatus })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Danh sách người dùng' })
  async getUsers(
    @Query('role') role?: UserRole,
    @Query('status') status?: UserStatus,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    return this.adminService.getUsers({
      role,
      status,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20
    });
  }

  @Patch('users/:userId/status')
  @ApiOperation({ summary: 'Khóa hoặc mở khóa tài khoản người dùng' })
  @ApiResponse({ status: 200, description: 'Cập nhật trạng thái người dùng thành công' })
  async updateUserStatus(
    @CurrentUser('id') adminId: string,
    @Param('userId') userId: string,
    @Body('status') status: UserStatus
  ) {
    return this.adminService.updateUserStatus(adminId, userId, status);
  }

  @Post('users/:userId/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đặt lại mật khẩu cho tài khoản người dùng' })
  @ApiResponse({ status: 200, description: 'Đặt lại mật khẩu thành công' })
  async resetUserPassword(
    @CurrentUser('id') adminId: string,
    @Param('userId') userId: string,
    @Body('newPassword') newPassword?: string
  ) {
    return this.adminService.resetUserPassword(adminId, userId, newPassword);
  }

  @Get('classrooms')
  @ApiOperation({ summary: 'Quản trị viên xem danh sách toàn bộ lớp học trên hệ thống' })
  @ApiResponse({ status: 200, description: 'Danh sách lớp học toàn hệ thống' })
  async getAllClassrooms() {
    return this.adminService.getAllClassrooms();
  }

  @Get('curriculum-stats')
  @ApiOperation({ summary: 'Thống kê chi tiết ngân hàng câu hỏi theo khối lớp, chương và mức độ' })
  @ApiResponse({ status: 200, description: 'Thống kê ngân hàng câu hỏi' })
  async getCurriculumStats() {
    return this.adminService.getCurriculumStats();
  }
}
