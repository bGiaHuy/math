import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ClassroomService } from './classroom.service';
import { CreateClassroomDto } from './dto/create-classroom.dto';
import { GenerateInviteCodeDto } from './dto/generate-invite-code.dto';
import { JoinClassroomDto } from './dto/join-classroom.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Classrooms & Crockford Invite Codes')
@Controller('classrooms')
@UseGuards(AuthGuard, RolesGuard)
@ApiBearerAuth()
export class ClassroomController {
  constructor(private readonly classroomService: ClassroomService) {}

  @Post()
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Giáo viên tạo lớp học mới (tự động sinh mã mời 8 ký tự Crockford Base32)' })
  @ApiResponse({ status: 201, description: 'Tạo lớp học và mã mời thành công' })
  async createClassroom(
    @CurrentUser('id') teacherId: string,
    @CurrentUser('role') role: UserRole,
    @Body() dto: CreateClassroomDto
  ) {
    return this.classroomService.createClassroom(teacherId, dto, role);
  }

  @Get()
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách các lớp học do giáo viên quản lý' })
  @ApiResponse({ status: 200, description: 'Danh sách lớp học' })
  async getTeacherClassrooms(@CurrentUser('id') teacherId: string, @CurrentUser('role') role: UserRole) {
    return this.classroomService.getTeacherClassrooms(teacherId, role);
  }

  @Post('join')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Học sinh tham gia lớp học bằng mã mời Crockford Base32' })
  @ApiResponse({ status: 200, description: 'Tham gia lớp học thành công' })
  async joinClassroom(
    @CurrentUser('id') studentId: string,
    @Body() dto: JoinClassroomDto
  ) {
    return this.classroomService.joinClassroom(studentId, dto);
  }

  @Get(':id')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Xem chi tiết lớp học và danh sách học sinh (có kiểm tra quyền sở hữu scope)' })
  @ApiResponse({ status: 200, description: 'Chi tiết lớp học' })
  async getClassroomDetails(
    @CurrentUser('id') teacherId: string,
    @CurrentUser('role') role: UserRole,
    @Param('id') classId: string
  ) {
    return this.classroomService.getClassroomDetails(teacherId, classId, role);
  }

  @Post(':id/invite-codes')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Sinh mã mời Crockford mới cho lớp học' })
  @ApiResponse({ status: 201, description: 'Mã mời mới' })
  async generateInviteCode(
    @CurrentUser('id') teacherId: string,
    @CurrentUser('role') role: UserRole,
    @Param('id') classId: string,
    @Body() dto: GenerateInviteCodeDto
  ) {
    return this.classroomService.generateInviteCode(teacherId, classId, dto, role);
  }

  @Post(':id/invite-codes/:codeId/revoke')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Thu hồi mã mời lớp học' })
  @ApiResponse({ status: 200, description: 'Thu hồi thành công' })
  async revokeInviteCode(
    @CurrentUser('id') teacherId: string,
    @CurrentUser('role') role: UserRole,
    @Param('id') classId: string,
    @Param('codeId') codeId: string
  ) {
    return this.classroomService.revokeInviteCode(teacherId, classId, codeId, role);
  }

  @Get(':id/students')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách học sinh trong lớp' })
  @ApiResponse({ status: 200, description: 'Danh sách học sinh' })
  async getClassroomStudents(
    @CurrentUser('id') teacherId: string,
    @CurrentUser('role') role: UserRole,
    @Param('id') classId: string
  ) {
    return this.classroomService.getClassroomStudents(teacherId, classId, role);
  }
}
