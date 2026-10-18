import { AssignmentSettingsDto } from '../teacher-workspace.dto';
import { TypedQuestionDto } from '../../question/typed-question.dto';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsArray,
  ArrayMinSize,
  IsEnum,
  IsDateString,
  ValidateNested,
  IsBoolean
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssignmentStatus } from '@prisma/client';

export class CustomQuestionOptionDto {
  @ApiProperty({ description: 'Mã đáp án ("A", "B", "C", "D")', example: 'A' })
  @IsString()
  @IsNotEmpty({ message: 'Mã đáp án không được để trống' })
  key: string;

  @ApiProperty({ description: 'Nội dung lựa chọn', example: 'x = 3' })
  @IsString()
  @IsNotEmpty({ message: 'Nội dung lựa chọn không được để trống' })
  content: string;

  @ApiPropertyOptional({ description: 'Đánh dấu đáp án đúng (tùy chọn)', example: true })
  @IsBoolean()
  @IsOptional()
  isCorrect?: boolean;
}

export class CustomQuestionDto extends TypedQuestionDto {
  @ApiProperty({ description: 'Nội dung câu hỏi (hỗ trợ văn bản và KaTeX math)', example: 'Tính giá trị của biểu thức $\\sqrt{25}$' })
  @IsString()
  @IsNotEmpty({ message: 'Nội dung câu hỏi không được để trống' })
  content: string;

  @ApiProperty({ description: 'Danh sách lựa chọn (thường gồm 4 lựa chọn A, B, C, D)', type: [CustomQuestionOptionDto] })
  @IsArray({ message: 'Lựa chọn phải là danh sách' })
  @ArrayMinSize(2, { message: 'Mỗi câu hỏi phải có ít nhất 2 lựa chọn' })
  @ValidateNested({ each: true })
  @Type(() => CustomQuestionOptionDto)
  @IsOptional()
  options?: CustomQuestionOptionDto[];

  @ApiPropertyOptional({ description: 'Mã đáp án đúng ("A", "B", "C" hoặc "D")', example: 'A' })
  @IsString()
  @IsOptional()
  correctOption?: string;

  @ApiPropertyOptional({ description: 'Lời giải thích chi tiết', example: 'Ta có $\\sqrt{25} = 5$' })
  @IsString()
  @IsOptional()
  explanation?: string;

  @ApiPropertyOptional({ description: 'Mức độ nhận thức (REMEMBERING, UNDERSTANDING, APPLYING)', example: 'REMEMBERING' })
  @IsString()
  @IsOptional()
  cognitiveLevel?: string;

  @ApiPropertyOptional({ description: 'ID kỹ năng / bài học (nếu có)' })
  @IsString()
  @IsOptional()
  skillId?: string;
}

export class QuestionCountsDto {
 @IsInt() @Min(0) SINGLE_CHOICE: number;
 @IsInt() @Min(0) TRUE_FALSE: number;
 @IsInt() @Min(0) SHORT_ANSWER: number;
}
export class CreateAssignmentDto {
 @IsOptional() @ValidateNested() @Type(() => AssignmentSettingsDto) settings?: AssignmentSettingsDto;
 @IsOptional() @ValidateNested() @Type(()=>QuestionCountsDto) questionCounts?: QuestionCountsDto;
  @ApiProperty({ description: 'Tiêu đề đề thi / bài tập', example: 'Kiểm tra 15 phút - Căn bậc hai' })
  @IsString()
  @IsNotEmpty({ message: 'Tiêu đề không được để trống' })
  title: string;

  @ApiPropertyOptional({ description: 'Mô tả / Hướng dẫn làm bài', example: 'Làm bài trong 15 phút, không sử dụng tài liệu' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Thời lượng làm bài tính bằng phút (0 = không giới hạn thời gian)', example: 15 })
  @IsInt({ message: 'Thời lượng phải là số nguyên' })
  @Min(0, { message: 'Thời lượng tối thiểu là 0 (không giới hạn)' })
  @Max(360, { message: 'Thời lượng tối đa là 360 phút' })
  durationMinutes: number;

  @ApiPropertyOptional({ description: 'Hạn nộp bài (ISO 8601 string)', example: '2026-10-15T23:59:59.000Z' })
  @IsDateString({}, { message: 'Hạn nộp phải là định dạng ngày giờ ISO 8601 hợp lệ' })
  @IsOptional()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Danh sách ID các câu hỏi trong đề thi (chọn từ ngân hàng)', type: [String], example: ['uuid-1', 'uuid-2'] })
  @IsArray({ message: 'Danh sách câu hỏi phải là một mảng' })
  @IsString({ each: true })
  @IsOptional()
  questionIds?: string[];

  @ApiPropertyOptional({ description: 'Danh sách câu hỏi tùy chỉnh do giáo viên tự tạo hoặc nhập từ file AI/JSON', type: [CustomQuestionDto] })
  @IsArray({ message: 'Danh sách câu hỏi tự tạo phải là một mảng' })
  @ValidateNested({ each: true })
  @Type(() => CustomQuestionDto)
  @IsOptional()
  customQuestions?: CustomQuestionDto[];

  @ApiPropertyOptional({ description: 'Trạng thái phát hành đề thi', enum: AssignmentStatus, default: AssignmentStatus.PUBLISHED })
  @IsEnum(AssignmentStatus)
  @IsOptional()
  status?: AssignmentStatus;
}
