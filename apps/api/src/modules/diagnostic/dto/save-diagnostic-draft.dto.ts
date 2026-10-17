import { IsString, IsNotEmpty, IsArray, ArrayMaxSize } from 'class-validator';
export class SaveDiagnosticDraftDto {
  @IsString() @IsNotEmpty() attemptId: string;
  @IsArray() @ArrayMaxSize(64) answers: {questionId: string; selectedOptionKey?: string; response?: {trueFalseAnswers?: Record<string, boolean>; shortAnswer?: string}}[];
}
