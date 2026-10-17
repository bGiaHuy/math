import { IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CognitiveLevel, QuestionDifficulty } from '@prisma/client';
import { QuestionCountsDto } from './create-assignment.dto';

export class RandomExamDto {
  @IsOptional() @ValidateNested() @Type(() => QuestionCountsDto) questionCounts?: QuestionCountsDto;
  @IsOptional() @IsString() skillId?: string;
  @IsOptional() @IsEnum(CognitiveLevel) cognitiveLevel?: CognitiveLevel;
  @IsOptional() @IsEnum(QuestionDifficulty) difficulty?: QuestionDifficulty;
}
