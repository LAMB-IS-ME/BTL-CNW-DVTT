-- Prisma does not express partial unique indexes or CHECK constraints.
CREATE UNIQUE INDEX "ExamAttempt_one_active" ON "ExamAttempt" ("examId", "studentId") WHERE status = 'IN_PROGRESS';
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_valid_schedule" CHECK ("closeAt" > "openAt" AND "durationMinutes" > 0 AND "maxAttempts" > 0 AND "passScorePercent" BETWEEN 0 AND 100);
ALTER TABLE "Question" ADD CONSTRAINT "Question_positive_points" CHECK ("defaultPoints" > 0);
ALTER TABLE "ExamQuestion" ADD CONSTRAINT "ExamQuestion_positive_points" CHECK (points > 0);
ALTER TABLE "ExamQuestionPool" ADD CONSTRAINT "ExamQuestionPool_valid" CHECK ("pickCount" > 0 AND "pointsEach" > 0);
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_valid" CHECK ("maxScore" > 0 AND "expiresAt" > "startedAt" AND "objectiveScore" >= 0 AND "manualScore" >= 0 AND ("totalScore" IS NULL OR "totalScore" BETWEEN 0 AND "maxScore"));
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_nonnegative" CHECK (("autoScore" IS NULL OR "autoScore" >= 0) AND ("manualScore" IS NULL OR "manualScore" >= 0));
ALTER TABLE "LiveQuizQuestion" ADD CONSTRAINT "LiveQuizQuestion_valid" CHECK ("timeLimitSeconds" BETWEEN 5 AND 300 AND "basePoints" > 0);
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_valid" CHECK ("responseTimeMs" >= 0 AND "pointsAwarded" >= 0);
-- No Supabase anonymous client may read these tables. Backend connects with a
-- dedicated trusted database role (table owner/BYPASSRLS); it enforces ownership.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['User','Class','ClassMember','QuestionBank','Question','QuestionOption','QuestionAsset','Exam','ExamClass','ExamQuestion','ExamQuestionPool','ExamAttempt','AttemptQuestion','AttemptAnswer','LiveQuiz','LiveQuizQuestion','QuizRoom','QuizParticipant','LiveRoomQuestion','QuizAnswer','session'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
