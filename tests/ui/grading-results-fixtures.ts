import { expect, type Page } from "@playwright/test";
import { createDb } from "../../apps/api/src/db/client";
import { database, base, fixture } from "./student-focus-fixtures";

export { base, database };

export function gradingPassword() {
  const password = process.env.DEMO_PASSWORD;
  if (!password)
    throw new Error("Set DEMO_PASSWORD to the isolated test seed password");
  return password;
}
export async function gradingFixture(submissions = 21) {
  const exam = await fixture(4);
  const db = createDb(database);
  try {
    await db.exam.update({
      where: { id: exam.id },
      data: {
        resultReleaseMode: "MANUAL",
        showCorrectAnswers: true,
        showExplanations: true,
        maxAttempts: 2,
      },
    });
    const student = await db.user.findUniqueOrThrow({
      where: { email: "student1@exam.local" },
    });
    const classroom = await db.class.create({
      data: {
        name: "CNW · Nhóm thực hành 02",
        teacherId: exam.teacherId,
      },
    });
    await db.examClass.deleteMany({ where: { examId: exam.id } });
    await db.examClass.create({
      data: { examId: exam.id, classId: classroom.id },
    });
    const questions = await db.examQuestion.findMany({
      where: { examId: exam.id },
      orderBy: { orderIndex: "asc" },
      include: { question: { include: { options: true } } },
    });
    const baseNames = [
      student.fullName,
      "Bùi Thị Mai Anh",
      "Đặng Minh Đức",
      "Đỗ Nguyễn Hoàng Phương Anh",
      "Hoàng Gia Bảo",
      "Lê Minh Châu",
      "Lê Thị Ngọc Hà",
      "Ngô Thành Đạt",
      "Nguyễn Anh Dũng",
      "Nguyễn Hoàng Hải",
      "Nguyễn Khánh Linh",
      "Nguyễn Minh Quân",
      "Nguyễn Phương Thảo",
      "Phạm Đức Anh",
      "Phạm Thu Hương",
      "Phan Minh Khang",
      "Trần Bảo Ngọc",
      "Trần Hoàng Nam",
      "Trần Minh Nhật",
      "Trần Thanh Tâm",
      "Võ Anh Thư",
      "Vũ Hoàng Yến",
      "Vũ Minh Triết",
      "Vương Quỳnh Như",
    ];
    const names = Array.from(
      { length: submissions === 21 ? 24 : submissions },
      (_, i) => baseNames[i] || `Sinh viên ${String(i + 1).padStart(3, "0")}`,
    );
    const attempts = [];
    for (const [i, fullName] of names.entries()) {
      const user =
        i === 0
          ? student
          : await db.user.create({
              data: {
                email: `register-${crypto.randomUUID()}@test.local`,
                passwordHash: student.passwordHash,
                fullName,
                studentCode: `2026${String(i).padStart(4, "0")}-${exam.id.slice(0, 4)}`,
                role: "STUDENT",
              },
            });
      await db.classMember.create({
        data: { classId: classroom.id, studentId: user.id },
      });
      if (i > submissions) continue;
      const graded = i > 0 && i < submissions && i % 4 !== 0;
      const manualScore = graded ? (i % 7) * 0.5 : null;
      const a = await db.examAttempt.create({
        data: {
          examId: exam.id,
          studentId: user.id,
          attemptNo: 1,
          status:
            i === submissions
              ? "IN_PROGRESS"
              : graded
                ? "GRADED"
                : "PENDING_MANUAL_GRADING",
          startedAt: new Date(Date.now() - 1200000),
          expiresAt: new Date(Date.now() + 1200000),
          submittedAt:
            i === submissions ? null : new Date(Date.now() - i * 1000),
          lastActivityAt: new Date(),
          objectiveScore: i === submissions ? 0 : 2,
          manualScore: manualScore ?? 0,
          totalScore: graded ? 2 + manualScore! : null,
          maxScore: 6,
          questions: {
            create: questions.map(({ question: q, points, orderIndex }) => ({
              originalQuestionId: q.id,
              sourceType: "FIXED",
              orderIndex,
              points,
              snapshotJson: {
                id: q.id,
                type: q.type,
                promptMarkdown: q.promptMarkdown,
                explanationMarkdown: q.explanationMarkdown,
                options: q.options.map((o) => ({
                  id: o.id,
                  contentMarkdown: o.contentMarkdown,
                  isCorrect: o.isCorrect,
                })),
              },
              answer: {
                create:
                  q.type === "ESSAY"
                    ? {
                        answerText:
                          "HTTP không tự ghi nhớ người dùng giữa các request. Sau khi đăng nhập thành công, server tạo một session và gửi session ID qua cookie.\n\nỞ các request tiếp theo, trình duyệt gửi cookie. Server dùng ID để tìm phiên đã lưu và xác định người dùng cùng quyền truy cập.\n\nCookie nên có HttpOnly để JavaScript không đọc được, Secure để chỉ gửi qua HTTPS và SameSite để giảm rủi ro CSRF. Khi đăng xuất, server hủy phiên và xóa cookie.",
                        manualScore,
                        gradedBy: graded ? exam.teacherId : null,
                        gradedAt: graded ? new Date() : null,
                        feedback: graded
                          ? "Lập luận rõ. Cần phân biệt vai trò của SameSite và CSRF token."
                          : null,
                      }
                    : {
                        answerJson: q.options
                          .filter((o) =>
                            orderIndex === 3 ? !o.isCorrect : o.isCorrect,
                          )
                          .map((o) => o.id),
                        autoScore:
                          i === submissions ? null : orderIndex === 3 ? 0 : 1,
                      },
              },
            })),
          },
        },
        include: { questions: { include: { answer: true } } },
      });
      attempts.push(a);
    }
    return { exam, student, attempts };
  } finally {
    await db.$disconnect();
  }
}

export async function signIn(page: Page, role: "teacher" | "student") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(`${role}1@exam.local`);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(gradingPassword());
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL(`/${role}`);
}

export async function setRelease(examId: string, released: boolean) {
  const db = createDb(database);
  try {
    await db.exam.update({
      where: { id: examId },
      data: { manualResultsReleasedAt: released ? new Date() : null },
    });
  } finally {
    await db.$disconnect();
  }
}

export async function assertNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
}
