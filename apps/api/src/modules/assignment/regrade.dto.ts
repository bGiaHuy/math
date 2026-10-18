import { Type } from 'class-transformer';
import { IsArray, ArrayMaxSize, ValidateNested, IsInt, Min, IsString, MaxLength, IsOptional, IsBoolean, IsNumber, Max, IsEnum } from 'class-validator';
import { CustomQuestionDto } from './dto/create-assignment.dto';
export class RevisionQuestionDto extends CustomQuestionDto {
  @IsOptional() @IsNumber() @Min(0.01) @Max(100) points?: number;
  @IsOptional() @IsEnum(['NORMAL', 'FULL_CREDIT', 'EXCLUDE']) gradingMode?: string;
  @IsString() id: string;
}
export class RegradeDto {
  @IsInt() @Min(1) revision: number;
  @IsString() @MaxLength(1000) reason: string;
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => RevisionQuestionDto) questions: RevisionQuestionDto[];
  @IsOptional() @IsBoolean() apply?: boolean;
}
