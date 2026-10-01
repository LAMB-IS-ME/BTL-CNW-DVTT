import { z } from "zod";
export const roles = ["ADMIN", "TEACHER", "STUDENT"] as const;
export type Role = (typeof roles)[number];
export const questionTypes = [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "ESSAY",
] as const;
export const idSchema = z.string().uuid();
const emailSchema = z
  .string({ error: "Vui lòng nhập email." })
  .trim()
  .min(1, "Vui lòng nhập email.")
  .pipe(z.email({ error: "Email không hợp lệ." }))
  .transform((value) => value.toLowerCase());
const loginPasswordSchema = z
  .string({ error: "Vui lòng nhập mật khẩu." })
  .min(1, "Vui lòng nhập mật khẩu.")
  .max(128, "Mật khẩu không được vượt quá 128 ký tự.");
// Password policy applies when setting a new password, not when verifying one.
export const newPasswordSchema = loginPasswordSchema.min(
  10,
  "Mật khẩu phải có ít nhất 10 ký tự.",
);
export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});
export const registerSchema = loginSchema.extend({
  password: newPasswordSchema,
  fullName: z
    .string({ error: "Vui lòng nhập họ và tên." })
    .trim()
    .min(2, "Họ và tên phải có ít nhất 2 ký tự.")
    .max(120, "Họ và tên không được vượt quá 120 ký tự."),
  studentCode: z
    .string({ error: "Mã sinh viên không hợp lệ." })
    .trim()
    .min(1, "Vui lòng nhập mã sinh viên hoặc để trống.")
    .max(40, "Mã sinh viên không được vượt quá 40 ký tự.")
    .optional(),
});
export type UserDto = {
  id: string;
  email: string;
  fullName: string;
  studentCode: string | null;
  role: Role;
  status: "ACTIVE" | "LOCKED";
};
export type ApiError = { error: { code: string; message: string } };
export type PresenceStatus =
  "NOT_STARTED" | "IN_PROGRESS" | "DISCONNECTED" | "SUBMITTED";
export const questionSchema = z
  .object({
    type: z.enum(questionTypes),
    promptMarkdown: z.string().min(1).max(50000),
    explanationMarkdown: z.string().max(50000).nullable().optional(),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
    tags: z.array(z.string().min(1).max(60)).max(20).default([]),
    defaultPoints: z.coerce.number().positive().max(10000).default(1),
    options: z
      .array(
        z.object({
          contentMarkdown: z.string().min(1).max(10000),
          isCorrect: z.boolean(),
        }),
      )
      .max(20)
      .default([]),
  })
  .superRefine((q, ctx) => {
    const n = q.options.length,
      c = q.options.filter((o) => o.isCorrect).length;
    if (
      q.type === "ESSAY"
        ? n !== 0
        : n < 2 ||
          c < 1 ||
          (q.type !== "MULTIPLE_CHOICE" && c !== 1) ||
          (q.type === "TRUE_FALSE" &&
            (n !== 2 ||
              q.options[0]?.contentMarkdown !== "True" ||
              q.options[1]?.contentMarkdown !== "False"))
    )
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message:
          "Lựa chọn/đáp án không phù hợp loại câu hỏi. True/False phải có đúng hai lựa chọn True, False.",
      });
  });
export type QuestionInput = z.infer<typeof questionSchema>;
export type QuestionDto = Omit<QuestionInput, "defaultPoints" | "options"> & {
  id: string;
  bankId: string;
  defaultPoints: string | number;
  options: { id: string; contentMarkdown: string; isCorrect: boolean }[];
};
export const examSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    descriptionMarkdown: z.string().max(20000).nullable().optional(),
    openAt: z.iso.datetime(),
    closeAt: z.iso.datetime(),
    durationMinutes: z.coerce.number().int().min(1).max(1440),
    maxAttempts: z.coerce.number().int().min(1).max(20).default(1),
    resultStrategy: z
      .enum(["HIGHEST_SCORE", "LATEST_ATTEMPT"])
      .default("HIGHEST_SCORE"),
    resultReleaseMode: z
      .enum(["IMMEDIATE", "AFTER_CLOSE", "MANUAL"])
      .default("MANUAL"),
    shuffleQuestions: z.boolean().default(false),
    shuffleOptions: z.boolean().default(false),
    showCorrectAnswers: z.boolean().default(false),
    showExplanations: z.boolean().default(false),
    showDetailedScore: z.boolean().default(true),
    passScorePercent: z.coerce.number().min(0).max(100).default(50),
  })
  .refine((e) => new Date(e.closeAt) > new Date(e.openAt), {
    path: ["closeAt"],
    message: "Giờ đóng phải sau giờ mở.",
  });
export type ExamInput = z.infer<typeof examSchema>;
export type ExamDto = ExamInput & {
  id: string;
  status: string;
  classes: { classId: string }[];
  questions: {
    questionId: string;
    points: number | string;
    question: QuestionDto;
  }[];
  pools: {
    questionBankId: string;
    pickCount: number;
    pointsEach: number | string;
    difficultyFilter?: "EASY" | "MEDIUM" | "HARD" | null;
    tagFilter: string[];
  }[];
};
export type Snapshot = {
  id: string;
  type: (typeof questionTypes)[number];
  promptMarkdown: string;
  explanationMarkdown: string | null;
  options: { id: string; contentMarkdown: string; isCorrect: boolean }[];
};
export type StudentQuestion = {
  id: string;
  type: (typeof questionTypes)[number];
  promptMarkdown: string;
  options: { id: string; contentMarkdown: string }[];
  points: number;
};
export type AnswerInput = { selectedOptionIds: string[]; answerText: string };
export type AttemptDto = {
  id: string;
  examId: string;
  title: string;
  attemptNo: number;
  status: string;
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  serverNow: string;
  questions: (StudentQuestion & {
    answer: AnswerInput & { savedAt: string | null };
  })[];
};
export type MonitorRow = {
  studentId: string;
  fullName: string;
  studentCode: string | null;
  status: PresenceStatus;
  attemptId: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  lastActivityAt: string | null;
};
export type MonitorSnapshot = {
  examId: string;
  serverNow: string;
  rows: MonitorRow[];
};
export type SocketAck<T = unknown> = (
  result: { data: T } | { error: { code: string; message: string } },
) => void;
export interface ClientEvents extends QuizClientEvents {
  "exam:monitor:join": (
    payload: { examId: string },
    ack: SocketAck<MonitorSnapshot>,
  ) => void;
  "exam:attempt:presence:join": (
    payload: { attemptId: string },
    ack: SocketAck<{ joined: boolean }>,
  ) => void;
  "exam:attempt:heartbeat": (
    payload: { attemptId: string },
    ack: SocketAck<{ joined: boolean }>,
  ) => void;
}
export interface ServerEvents extends QuizServerEvents {
  "exam:monitor:snapshot": (payload: MonitorSnapshot) => void;
  "exam:participant:status": (payload: MonitorSnapshot) => void;
  "exam:attempt:submitted": (payload: { id: string }) => void;
  "exam:attempt:auto-submitted": (payload: { id: string }) => void;
  "server:error": (payload: { code: string; message: string }) => void;
}
export type ResultAttempt = {
  id: string;
  attemptNo: number;
  status: string;
  submittedAt: string | null;
  visible: boolean;
  totalScore?: number;
  maxScore?: number;
  percentage?: number;
  questions?: {
    id: string;
    type: string;
    promptMarkdown: string;
    points?: number;
    score?: number;
    options: { id: string; contentMarkdown: string; isCorrect?: boolean }[];
    selectedOptionIds: string[];
    answerText: string;
    explanationMarkdown?: string | null;
    feedback?: string | null;
  }[];
};
export type StudentResult = {
  examId: string;
  title: string;
  resultStrategy: string;
  finalAttemptId: string | null;
  attempts: ResultAttempt[];
};
export type QuizState = {
  roomId: string;
  code: string;
  title: string;
  status: "LOBBY" | "LIVE" | "FINISHED" | "CANCELLED";
  currentIndex: number | null;
  total: number;
  serverNow: string;
  closesAt: string | null;
  participants: { id: string; fullName: string; isConnected: boolean }[];
  question: StudentQuestion | null;
  reveal: {
    correctOptionIds: string[];
    explanationMarkdown: string | null;
    answerCount: number;
  } | null;
  leaderboard: { id: string; fullName: string; score: number; rank: number }[];
  ownAnswer: string[] | null;
};
export interface QuizClientEvents {
  "quiz:room:join": (
    payload: { roomId?: string; code?: string },
    ack: SocketAck<QuizState>,
  ) => void;
  "quiz:host:start": (
    payload: { roomId: string },
    ack: SocketAck<QuizState>,
  ) => void;
  "quiz:host:next": (
    payload: { roomId: string },
    ack: SocketAck<QuizState>,
  ) => void;
  "quiz:answer": (
    payload: {
      roomId: string;
      questionId: string;
      selectedOptionIds: string[];
    },
    ack: SocketAck<{ accepted: boolean }>,
  ) => void;
  "quiz:room:leave": (
    payload: { roomId: string },
    ack: SocketAck<{ left: boolean }>,
  ) => void;
}
export interface QuizServerEvents {
  "quiz:state": (payload: QuizState) => void;
  "quiz:lobby:snapshot": (payload: QuizState) => void;
  "quiz:participant:joined": (payload: QuizState) => void;
  "quiz:participant:left": (payload: QuizState) => void;
  "quiz:started": (payload: QuizState) => void;
  "quiz:question": (payload: QuizState) => void;
  "quiz:answer:accepted": (payload: { questionId: string }) => void;
  "quiz:answer:rejected": (payload: { code: string; message: string }) => void;
  "quiz:question:closed": (payload: QuizState) => void;
  "quiz:reveal": (payload: QuizState) => void;
  "quiz:leaderboard": (payload: QuizState) => void;
  "quiz:finished": (payload: QuizState) => void;
  "quiz:error": (payload: { code: string; message: string }) => void;
}
