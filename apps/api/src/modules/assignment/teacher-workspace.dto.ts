import { Type } from 'class-transformer';
import { IsUUID, IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AssignmentStatus } from '@prisma/client';

export class AssignmentSettingsDto {
  @IsOptional() @IsBoolean() trackTabSwitches?: boolean;
  @IsOptional() @IsUUID() documentId?: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(120) folder?: string;
  @IsOptional() @IsEnum(AssignmentStatus) status?: AssignmentStatus;
  @IsOptional() @IsEnum(['PRACTICE', 'TEST']) mode?: string;
  @IsOptional() @IsEnum(['IMMEDIATE', 'AFTER_DUE', 'MANUAL']) resultsPolicy?: string;
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @IsBoolean() showSolutions?: boolean;
}
export class ActivityDto {
  @IsDateString() occurredAt: string;
  @IsString() @MaxLength(80) id: string;
  @IsEnum(['HIDDEN', 'VISIBLE', 'RELOAD']) kind: string;
  @IsString() @MaxLength(80) sessionId: string;
}
