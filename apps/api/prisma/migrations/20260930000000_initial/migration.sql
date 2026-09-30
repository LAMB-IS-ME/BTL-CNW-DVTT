-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'TEACHER', 'STUDENT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'ESSAY');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ResultStrategy" AS ENUM ('HIGHEST_SCORE', 'LATEST_ATTEMPT');

-- CreateEnum
CREATE TYPE "ResultReleaseMode" AS ENUM ('IMMEDIATE', 'AFTER_CLOSE', 'MANUAL');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'PENDING_MANUAL_GRADING', 'GRADED');

-- CreateEnum
CREATE TYPE "QuestionSourceType" AS ENUM ('FIXED', 'RANDOM_POOL');

-- CreateEnum
CREATE TYPE "QuizRoomStatus" AS ENUM ('LOBBY', 'LIVE', 'FINISHED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "studentCode" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'STUDENT',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Class" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "archivedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassMember" (
    "classId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassMember_pkey" PRIMARY KEY ("classId","studentId")
);

-- CreateTable
CREATE TABLE "QuestionBank" (
    "id" UUID NOT NULL,
    "ownerTeacherId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT,
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "QuestionBank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" UUID NOT NULL,
    "bankId" UUID NOT NULL,
    "type" "QuestionType" NOT NULL,
    "promptMarkdown" TEXT NOT NULL,
    "explanationMarkdown" TEXT,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "tags" TEXT[],
    "defaultPoints" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionOption" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "contentMarkdown" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionAsset" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "altText" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "descriptionMarkdown" TEXT,
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "openAt" TIMESTAMPTZ NOT NULL,
    "closeAt" TIMESTAMPTZ NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "resultStrategy" "ResultStrategy" NOT NULL DEFAULT 'HIGHEST_SCORE',
    "resultReleaseMode" "ResultReleaseMode" NOT NULL DEFAULT 'MANUAL',
    "manualResultsReleasedAt" TIMESTAMPTZ,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
    "shuffleOptions" BOOLEAN NOT NULL DEFAULT false,
    "showCorrectAnswers" BOOLEAN NOT NULL DEFAULT false,
    "showExplanations" BOOLEAN NOT NULL DEFAULT false,
    "showDetailedScore" BOOLEAN NOT NULL DEFAULT true,
    "passScorePercent" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "publishedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamClass" (
    "examId" UUID NOT NULL,
    "classId" UUID NOT NULL,

    CONSTRAINT "ExamClass_pkey" PRIMARY KEY ("examId","classId")
);

-- CreateTable
CREATE TABLE "ExamQuestion" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "points" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "ExamQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamQuestionPool" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "questionBankId" UUID NOT NULL,
    "pickCount" INTEGER NOT NULL,
    "pointsEach" DECIMAL(10,2) NOT NULL,
    "difficultyFilter" "Difficulty",
    "tagFilter" TEXT[],
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamQuestionPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamAttempt" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMPTZ NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "submittedAt" TIMESTAMPTZ,
    "autoSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "lastActivityAt" TIMESTAMPTZ NOT NULL,
    "objectiveScore" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "manualScore" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalScore" DECIMAL(10,2),
    "maxScore" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ExamAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttemptQuestion" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "originalQuestionId" UUID NOT NULL,
    "sourceType" "QuestionSourceType" NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "points" DECIMAL(10,2) NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttemptQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttemptAnswer" (
    "id" UUID NOT NULL,
    "attemptQuestionId" UUID NOT NULL,
    "answerJson" JSONB,
    "answerText" TEXT,
    "savedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autoScore" DECIMAL(10,2),
    "manualScore" DECIMAL(10,2),
    "feedback" TEXT,
    "gradedBy" UUID,
    "gradedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "AttemptAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveQuiz" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "descriptionMarkdown" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "LiveQuiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveQuizQuestion" (
    "id" UUID NOT NULL,
    "quizId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "timeLimitSeconds" INTEGER NOT NULL,
    "basePoints" INTEGER NOT NULL,

    CONSTRAINT "LiveQuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizRoom" (
    "id" UUID NOT NULL,
    "quizId" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "status" "QuizRoomStatus" NOT NULL DEFAULT 'LOBBY',
    "currentQuestionIndex" INTEGER,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ,
    "endedAt" TIMESTAMPTZ,
    "questionOpenedAt" TIMESTAMPTZ,
    "questionClosesAt" TIMESTAMPTZ,
    "revealedAt" TIMESTAMPTZ,

    CONSTRAINT "QuizRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizParticipant" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isConnected" BOOLEAN NOT NULL DEFAULT true,
    "finishedAt" TIMESTAMPTZ,

    CONSTRAINT "QuizParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveRoomQuestion" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "sourceQuizQuestionId" UUID NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "timeLimitSeconds" INTEGER NOT NULL,
    "basePoints" INTEGER NOT NULL,
    "snapshotJson" JSONB NOT NULL,

    CONSTRAINT "LiveRoomQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAnswer" (
    "id" UUID NOT NULL,
    "roomQuestionId" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "answerJson" JSONB NOT NULL,
    "answeredAt" TIMESTAMPTZ NOT NULL,
    "responseTimeMs" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "pointsAwarded" INTEGER NOT NULL,

    CONSTRAINT "QuizAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "sid" TEXT NOT NULL,
    "sess" JSONB NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_studentCode_key" ON "User"("studentCode");

-- CreateIndex
CREATE INDEX "Class_teacherId_idx" ON "Class"("teacherId");

-- CreateIndex
CREATE INDEX "ClassMember_studentId_idx" ON "ClassMember"("studentId");

-- CreateIndex
CREATE INDEX "QuestionBank_ownerTeacherId_idx" ON "QuestionBank"("ownerTeacherId");

-- CreateIndex
CREATE INDEX "Question_bankId_isArchived_idx" ON "Question"("bankId", "isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionOption_questionId_orderIndex_key" ON "QuestionOption"("questionId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionAsset_storagePath_key" ON "QuestionAsset"("storagePath");

-- CreateIndex
CREATE INDEX "QuestionAsset_questionId_idx" ON "QuestionAsset"("questionId");

-- CreateIndex
CREATE INDEX "Exam_teacherId_status_idx" ON "Exam"("teacherId", "status");

-- CreateIndex
CREATE INDEX "ExamClass_classId_idx" ON "ExamClass"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamQuestion_examId_questionId_key" ON "ExamQuestion"("examId", "questionId");

-- CreateIndex
CREATE INDEX "ExamQuestionPool_examId_idx" ON "ExamQuestionPool"("examId");

-- CreateIndex
CREATE INDEX "ExamAttempt_status_expiresAt_idx" ON "ExamAttempt"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExamAttempt_examId_studentId_attemptNo_key" ON "ExamAttempt"("examId", "studentId", "attemptNo");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptQuestion_attemptId_orderIndex_key" ON "AttemptQuestion"("attemptId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptQuestion_attemptId_originalQuestionId_key" ON "AttemptQuestion"("attemptId", "originalQuestionId");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptAnswer_attemptQuestionId_key" ON "AttemptAnswer"("attemptQuestionId");

-- CreateIndex
CREATE INDEX "LiveQuiz_teacherId_idx" ON "LiveQuiz"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveQuizQuestion_quizId_orderIndex_key" ON "LiveQuizQuestion"("quizId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "QuizRoom_code_key" ON "QuizRoom"("code");

-- CreateIndex
CREATE INDEX "QuizRoom_status_questionClosesAt_idx" ON "QuizRoom"("status", "questionClosesAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuizParticipant_roomId_studentId_key" ON "QuizParticipant"("roomId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveRoomQuestion_roomId_orderIndex_key" ON "LiveRoomQuestion"("roomId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "QuizAnswer_roomQuestionId_participantId_key" ON "QuizAnswer"("roomQuestionId", "participantId");

-- CreateIndex
CREATE INDEX "session_expire_idx" ON "session"("expire");

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassMember" ADD CONSTRAINT "ClassMember_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassMember" ADD CONSTRAINT "ClassMember_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBank" ADD CONSTRAINT "QuestionBank_ownerTeacherId_fkey" FOREIGN KEY ("ownerTeacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "QuestionBank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAsset" ADD CONSTRAINT "QuestionAsset_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamClass" ADD CONSTRAINT "ExamClass_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamClass" ADD CONSTRAINT "ExamClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamQuestion" ADD CONSTRAINT "ExamQuestion_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamQuestion" ADD CONSTRAINT "ExamQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamQuestionPool" ADD CONSTRAINT "ExamQuestionPool_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamQuestionPool" ADD CONSTRAINT "ExamQuestionPool_questionBankId_fkey" FOREIGN KEY ("questionBankId") REFERENCES "QuestionBank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptQuestion" ADD CONSTRAINT "AttemptQuestion_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExamAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_attemptQuestionId_fkey" FOREIGN KEY ("attemptQuestionId") REFERENCES "AttemptQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_gradedBy_fkey" FOREIGN KEY ("gradedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveQuiz" ADD CONSTRAINT "LiveQuiz_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveQuizQuestion" ADD CONSTRAINT "LiveQuizQuestion_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "LiveQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveQuizQuestion" ADD CONSTRAINT "LiveQuizQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizRoom" ADD CONSTRAINT "QuizRoom_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "LiveQuiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizRoom" ADD CONSTRAINT "QuizRoom_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizParticipant" ADD CONSTRAINT "QuizParticipant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "QuizRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizParticipant" ADD CONSTRAINT "QuizParticipant_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRoomQuestion" ADD CONSTRAINT "LiveRoomQuestion_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "QuizRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_roomQuestionId_fkey" FOREIGN KEY ("roomQuestionId") REFERENCES "LiveRoomQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "QuizParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

