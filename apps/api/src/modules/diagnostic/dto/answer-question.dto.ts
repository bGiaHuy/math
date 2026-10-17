import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsInt, IsObject, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AnswerQuestionDto {
  @ApiProperty({ description: 'ID của phiên làm bài chẩn đoán' })
  @IsString()
  @IsNotEmpty()
  attemptId: string;

  @ApiProperty({ description: 'ID của câu hỏi' })
  @IsString()
  @IsNotEmpty()
  questionId: string;

  @ApiProperty({ description: 'Đáp án học sinh chọn (A, B, C, D)', required: false })
  @IsString()
  @IsOptional()
  selectedOptionKey?: string;

  @IsOptional()
  @IsObject()
  response?: { trueFalseAnswers?: Record<string, boolean>; shortAnswer?: string };

  @ApiProperty({ description: 'Thời gian làm câu hỏi tính bằng giây', default: 0 })
  @IsInt()
  @Min(0)
  @Max(600)
  @IsOptional()
  timeSpentSeconds?: number;

  @ApiProperty({ description: 'Đánh dấu hết thời gian 90s', default: false })
  @IsBoolean()
  @IsOptional()
  isTimeout?: boolean;

  @ApiProperty({ description: 'Đánh dấu học sinh bấm bỏ qua', default: false })
  @IsBoolean()
  @IsOptional()
  isSkipped?: boolean;
}
