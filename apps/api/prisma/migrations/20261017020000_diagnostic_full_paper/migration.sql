ALTER TABLE "DiagnosticAttempt" ADD COLUMN "questionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], ADD COLUMN "draftAnswers" JSONB;
