CREATE TYPE "QuestionDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD', 'VERY_HARD');
ALTER TABLE "Question" ADD COLUMN "difficulty" "QuestionDifficulty" NOT NULL DEFAULT 'EASY';
UPDATE "Question" SET "difficulty" = CASE "cognitiveLevel"::text WHEN 'UNDERSTANDING' THEN 'MEDIUM'::"QuestionDifficulty" WHEN 'APPLYING' THEN 'HARD'::"QuestionDifficulty" WHEN 'ADVANCED_APPLYING' THEN 'VERY_HARD'::"QuestionDifficulty" ELSE 'EASY'::"QuestionDifficulty" END;
ALTER TABLE "AttemptAnswer" ADD COLUMN "response" JSONB, ADD COLUMN "gradingDetails" JSONB, ADD COLUMN "pointsAwarded" DOUBLE PRECISION;
