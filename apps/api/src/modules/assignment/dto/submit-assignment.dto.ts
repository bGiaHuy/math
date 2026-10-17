import { IsObject } from 'class-validator';
import {
  IsArray,
  ValidateNested,
  IsString,
  IsOptional,
  IsInt,
  Min
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnswerItemDto {
 @IsOptional() @IsObject() response?: {trueFalseAnswers?: Record<string, boolean>; shortAnswer?: string};
  @ApiProperty({ description: 'ID của câu hỏi' })
  @IsString()
  questionId: string;

  @ApiPropertyOptional({ description: 'Đáp án học sinh chọn ("A", "B", "C", "D") hoặc để trống' })
  @IsString()
  @IsOptional()
  selectedOptionKey?: string;

  @ApiPropertyOptional({ description: 'Tương thích ngược: Đáp án học sinh chọn ("A", "B", "C", "D")' })
  @IsString()
  @IsOptional()
  selectedOption?: string;
}

export class SubmitAssignmentDto {
  @ApiProperty({ description: 'Thời gian học sinh đã làm bài tính bằng giây', example: 540 })
  @IsInt()
  @Min(0)
  timeSpentSeconds: number;

  @ApiProperty({ description: 'Danh sách câu trả lời của học sinh', type: [AnswerItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerItemDto)
  answers: AnswerItemDto[];
}
