ALTER TABLE "ClassroomAssignment" ADD COLUMN "settings" JSONB NOT NULL DEFAULT '{}', ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AssignmentQuestion" ADD COLUMN "snapshot" JSONB;
ALTER TABLE "AssignmentSubmission" ADD COLUMN "activityEvents" JSONB NOT NULL DEFAULT '[]';
-- Freeze existing assignments before future bank edits can change a delivered exam.
UPDATE "AssignmentQuestion" aq SET "snapshot" = to_jsonb(q) || jsonb_build_object(
  'options', COALESCE((SELECT jsonb_agg(to_jsonb(o)) FROM "QuestionOption" o WHERE o."questionId" = q.id), '[]'::jsonb),
  'skill', (SELECT to_jsonb(s) FROM "SkillNode" s WHERE s.id = q."skillId")
) FROM "Question" q WHERE aq."questionId" = q.id;
