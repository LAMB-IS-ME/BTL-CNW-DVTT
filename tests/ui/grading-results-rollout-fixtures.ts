import { createDb } from "../../apps/api/src/db/client";
import { database, gradingFixture } from "./grading-results-fixtures";

export async function resultHistoryFixture(count: number) {
  const f = await gradingFixture(1);
  const db = createDb(database);
  try {
    const user = await db.user.create({
      data: {
        email: `history-${crypto.randomUUID()}@test.local`,
        passwordHash: f.student.passwordHash,
        fullName: "Sinh viên hồ sơ riêng",
        role: "STUDENT",
      },
    });
    const classroom = await db.class.create({
      data: {
        name: "Lịch sử kết quả",
        teacherId: f.exam.teacherId,
        members: { create: { studentId: user.id } },
      },
    });
    const essay = f.attempts[0]!.questions.find(
      (q) => (q.snapshotJson as { type: string }).type === "ESSAY",
    )!;
    const exams = [];
    for (let i = 0; i < count; i++) {
      const exam = await db.exam.create({
        data: {
          teacherId: f.exam.teacherId,
          title: `Hồ sơ học tập ${String(i + 1).padStart(2, "0")}`,
          status: "PUBLISHED",
          openAt: new Date(Date.now() - (i + 1) * 60000),
          closeAt: new Date(Date.now() + 86400000),
          durationMinutes: 45,
          maxAttempts: 1,
          resultReleaseMode: "IMMEDIATE",
          showDetailedScore: true,
          classes: { create: { classId: classroom.id } },
          questions: {
            create: {
              questionId: essay.originalQuestionId!,
              orderIndex: 0,
              points: 3,
            },
          },
          attempts: {
            create: {
              studentId: user.id,
              attemptNo: 1,
              status: "GRADED",
              startedAt: new Date(Date.now() - 120000),
              lastActivityAt: new Date(),
              expiresAt: new Date(Date.now() + 120000),
              submittedAt: new Date(),
              objectiveScore: 0,
              manualScore: 0,
              totalScore: 0,
              maxScore: 3,
              questions: {
                create: {
                  originalQuestionId: essay.originalQuestionId,
                  sourceType: "FIXED",
                  orderIndex: 0,
                  points: 3,
                  snapshotJson: essay.snapshotJson!,
                  answer: {
                    create: {
                      answerText: "Bài làm",
                      manualScore: 0,
                      feedback: "Nhận xét đã công bố",
                      gradedBy: f.exam.teacherId,
                      gradedAt: new Date(),
                    },
                  },
                },
              },
            },
          },
        },
      });
      exams.push(exam);
    }
    return { user, exams };
  } finally {
    await db.$disconnect();
  }
}
