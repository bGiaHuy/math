import { TypedQuestionDto } from '../../question/typed-question.dto';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsArray,
  ValidateNested,
  IsBoolean,
  ArrayMinSize, IsOptional, IsNumber, Min, Max
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CognitiveLevel } from '@prisma/client';

export class QuestionOptionDto {
  @ApiProperty({ description: 'Ký tự đáp án (A, B, C, D)', example: 'A' })
  @IsString()
  @IsNotEmpty()
  optionKey: string;

  @ApiProperty({ description: 'Nội dung phương án (văn bản hoặc công thức LaTeX)', example: '\\sqrt{35}' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ description: 'Đây có phải đáp án đúng không', example: false })
  @IsBoolean()
  isCorrect: boolean;
}

export class CreateQuestionDto extends TypedQuestionDto {
  @IsOptional() @IsNumber() @Min(0.05) @Max(5) irtA?: number;
  @IsOptional() @IsNumber() @Min(-4) @Max(4) irtB?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(0.5) irtC?: number;
  @ApiProperty({ description: 'ID của SkillNode kỹ năng tương ứng' })
  @IsString()
  @IsNotEmpty()
  skillId: string;

  @ApiProperty({
    description: 'Mức độ nhận thức',
    enum: CognitiveLevel,
    example: CognitiveLevel.REMEMBERING
  })
  @IsEnum(CognitiveLevel)
  cognitiveLevel: CognitiveLevel;

  @ApiProperty({ description: 'Nội dung câu hỏi (chứa LaTeX)', example: 'Rút gọn biểu thức \\sqrt{245}' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ description: 'Lời giải chi tiết từng bước', example: 'Ta có 245 = 49 * 5 = 7^2 * 5...' })
  @IsString()
  @IsNotEmpty()
  explanation: string;

  @ApiProperty({ description: '4 phương án lựa chọn', type: [QuestionOptionDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  @IsOptional()
  options?: QuestionOptionDto[];
}
