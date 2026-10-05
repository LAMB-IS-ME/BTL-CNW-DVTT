import type { Prisma } from "../../generated/prisma/client.js";
import { AppError, check } from "../../utils/errors.js";
import { materializeSources, ownExam } from "../exams/service.js";

export async function validateArchive(
  tx: Prisma.TransactionClient,
  teacherId: string,
  bankId: string,
  questionId?: string,
) {
  const source = questionId ? { id: questionId } : { bankId };
  const quiz = await tx.liveQuiz.findFirst({
    where: { isArchived: false, questions: { some: { question: source } } },
    select: { title: true },
  });
  check(
    !quiz,
    409,
    "SOURCE_IN_USE",
    quiz
      ? `Nguồn câu hỏi đang thuộc Quiz “${quiz.title}”. Hãy bỏ câu khỏi Quiz hoặc lưu trữ Quiz trước. Các phòng đã bắt đầu vẫn giữ bản chụp.`
      : undefined,
  );
  const exams = await tx.exam.findMany({
    where: {
      teacherId,
      status: "PUBLISHED",
      closeAt: { gt: new Date() },
      OR: [
        { questions: { some: { question: source } } },
        { pools: { some: { questionBankId: bankId } } },
      ],
    },
    select: { id: true, title: true },
  });
  for (const exam of exams) {
    try {
      await materializeSources(
        tx,
        await ownExam(tx, exam.id, teacherId),
        false,
      );
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      throw new AppError(
        409,
        "SOURCE_IN_USE",
        `Không thể lưu trữ vì bài thi “${exam.title}” đang công bố sẽ thiếu câu hợp lệ. Hãy cập nhật hoặc lưu trữ bài thi trước. Lượt thi cũ được giữ nguyên.`,
      );
    }
  }
}
