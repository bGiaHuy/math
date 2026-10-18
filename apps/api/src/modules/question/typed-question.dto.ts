import { MaxLength, IsArray, IsBoolean, IsEnum, IsNumber, IsObject, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
export class StatementDto {
 @IsString() key: string;
 @IsString() content: string;
 @IsBoolean() isCorrect: boolean;
}
export class ShortAnswerRuleDto {
 @IsOptional() @IsString() @MaxLength(1000) instructions?: string;
 @IsEnum({NUMERIC:'NUMERIC',TEXT:'TEXT'}) mode: 'NUMERIC'|'TEXT';
 @IsArray() @IsString({each:true}) acceptedAnswers: string[];
 @IsOptional() @IsNumber() @Min(0) tolerance?: number;
 @IsOptional() @IsBoolean() caseSensitive?: boolean;
}
export class TypedQuestionDto {
 @IsOptional() @IsEnum({EASY:'EASY',MEDIUM:'MEDIUM',HARD:'HARD',VERY_HARD:'VERY_HARD'}) difficulty?: 'EASY'|'MEDIUM'|'HARD'|'VERY_HARD';
 @IsOptional() @IsEnum({SINGLE_CHOICE:'SINGLE_CHOICE',TRUE_FALSE:'TRUE_FALSE',SHORT_ANSWER:'SHORT_ANSWER'}) questionType?: 'SINGLE_CHOICE'|'TRUE_FALSE'|'SHORT_ANSWER';
 @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(()=>StatementDto) statements?: StatementDto[];
 @IsOptional() @ValidateNested() @Type(()=>ShortAnswerRuleDto) shortAnswer?: ShortAnswerRuleDto;
 @IsOptional() @IsObject() source?: Record<string, unknown>;
}
