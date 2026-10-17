CREATE TYPE "MathQuestionType" AS ENUM ('SINGLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER');
ALTER TABLE "Question" ADD COLUMN "questionType" "MathQuestionType" NOT NULL DEFAULT 'SINGLE_CHOICE', ADD COLUMN "statements" JSONB, ADD COLUMN "shortAnswer" JSONB, ADD COLUMN "source" JSONB;
ALTER TABLE "SubmissionAnswer" ADD COLUMN "response" JSONB, ADD COLUMN "gradingDetails" JSONB;
