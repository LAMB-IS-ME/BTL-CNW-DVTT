import {
  useCatalogPage,
  CatalogControls,
  CatalogPager,
  BankPicker,
} from "./catalog-pagination";
import { useAuth } from "./auth";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient, useQueries } from "@tanstack/react-query";
import type { ExamDto, ExamInput, QuestionDto } from "@exam/shared";
import { api } from "../lib/api";
import {
  Field,
  ErrorNotice,
  Skeleton,
  Pager,
  ConfirmAction,
  typeLabels,
  difficultyLabels,
} from "./question-bank/ui";
import { Markdown } from "../components/Markdown";
import { Icon } from "../components/Icon";
import "../styles/teacher-exams.css";
const examStatusLabels: Record<string, string> = {
  DRAFT: "Bản nháp",
  PUBLISHED: "Đã công bố",
  ARCHIVED: "Đã lưu trữ",
};
const resultLabels = {
  HIGHEST_SCORE: "Lấy điểm cao nhất",
  LATEST_ATTEMPT: "Lấy lần thi gần nhất",
};
const releaseLabels = {
  IMMEDIATE: "Ngay sau khi nộp bài",
  AFTER_CLOSE: "Sau khi đóng bài thi",
  MANUAL: "Giảng viên công bố thủ công",
};
function ExamStatus({ status }: { status: ExamDto["status"] }) {
  return (
    <span className={`exam-status exam-status-${status.toLowerCase()}`}>
      {examStatusLabels[status] || status}
    </span>
  );
}
export function TeacherExams() {
  const paging = useCatalogPage<ExamDto>(
    "teacher-exams",
    "/teacher/exams",
    true,
  );
  const q = paging.query;
  return (
    <div className="exam-page">
      <nav className="qb-breadcrumb" aria-label="Đường dẫn">
        <Link to="/teacher">Không gian giảng viên</Link>
        <span>/</span>
        <span>Bài thi</span>
      </nav>
      <div className="qb-page-heading">
        <div>
          <p className="exam-context">Hồ sơ giảng dạy / Bài thi</p>
          <h1>Bài thi của tôi</h1>
          <p>
            Từ bản nháp đến buổi thi. Chuẩn bị đề, thiết lập lịch và theo dõi
            lớp học.
          </p>
        </div>
        <Link className="button" to="/teacher/exams/new">
          <Icon name="plus" size={16} /> Tạo bài thi
        </Link>
      </div>
      <CatalogControls paging={paging} label="Tìm bài thi" />
      <ErrorNotice
        error={q.error}
        retry={() => void q.refetch()}
        fallbackMessage="Không thể tải bài thi. Vui lòng thử lại."
      />
      {q.isPending ? (
        <Skeleton label="Đang tải bài thi…" />
      ) : (
        !q.error && (
          <section className="exam-list" aria-label="Danh sách bài thi">
            <div className="exam-list-heading">
              <div>
                <h2>Kế hoạch kiểm tra</h2>
                <p>Quản lý đề và lịch thi của bạn.</p>
              </div>
              <span className="exam-muted">
                {paging.items.length} bài thi đang hiển thị
              </span>
            </div>
            {!paging.items.length && (
              <div className="qb-empty">
                <Icon name="exam" size={32} />
                <h2>Chuẩn bị bài thi đầu tiên</h2>
                <p>
                  Bắt đầu với tên bài thi, sau đó chọn lớp và câu hỏi từ thư
                  viện.
                </p>
                <Link className="button" to="/teacher/exams/new">
                  Tạo bài thi
                </Link>
              </div>
            )}
            {paging.items.map((e, index) => (
              <article className="exam-list-row" key={e.id}>
                <span className="exam-list-index" aria-hidden="true">
                  {String((paging.page - 1) * 20 + index + 1).padStart(2, "0")}
                </span>
                <div className="exam-list-identity">
                  <ExamStatus status={e.status} />
                  <h2>
                    <Link to={`/teacher/exams/${e.id}/edit`}>{e.title}</Link>
                  </h2>
                  <p>
                    <span>{e.durationMinutes} phút</span>
                    <span>{e.maxAttempts} lượt thi</span>
                  </p>
                </div>
                <dl className="exam-list-schedule">
                  <div>
                    <dt>Mở bài</dt>
                    <dd>
                      {new Date(e.openAt).toLocaleString("vi-VN", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt>Đóng bài</dt>
                    <dd>
                      {new Date(e.closeAt).toLocaleString("vi-VN", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </dd>
                  </div>
                </dl>
                <div className="exam-row-actions">
                  <Link
                    className="exam-edit-link"
                    to={`/teacher/exams/${e.id}/edit`}
                  >
                    Chỉnh sửa
                  </Link>
                  <Link to={`/teacher/exams/${e.id}/preview`}>Xem trước</Link>
                  <div className="exam-row-links">
                    <Link to={`/teacher/exams/${e.id}/monitor`}>Giám sát</Link>
                    <Link to={`/teacher/exams/${e.id}/grading`}>Chấm bài</Link>
                    <Link to={`/teacher/exams/${e.id}/results`}>Kết quả</Link>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )
      )}
      <CatalogPager paging={paging} />
    </div>
  );
}
export function ExamBuilder({ preview = false }: { preview?: boolean }) {
  const { id } = useParams();
  const q = useQuery({
    queryKey: ["exam", id],
    queryFn: () => api<ExamDto>(`/teacher/exams/${id}`),
    enabled: !!id,
  });
  if (id && q.isPending) return <Skeleton label="Đang tải cấu hình bài thi…" />;
  if (q.error)
    return <ErrorNotice error={q.error} retry={() => void q.refetch()} />;
  return <BuilderForm key={id || "new"} exam={q.data} preview={preview} />;
}
const defaults: ExamInput = {
  title: "",
  descriptionMarkdown: "",
  openAt: new Date().toISOString(),
  closeAt: new Date(Date.now() + 86400000).toISOString(),
  durationMinutes: 45,
  maxAttempts: 1,
  resultStrategy: "HIGHEST_SCORE",
  resultReleaseMode: "MANUAL",
  shuffleQuestions: false,
  shuffleOptions: false,
  showCorrectAnswers: false,
  showExplanations: false,
  showDetailedScore: true,
  passScorePercent: 50,
};
const localDate = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
function BuilderForm({ exam, preview }: { exam?: ExamDto; preview: boolean }) {
  const nav = useNavigate();
  const cache = useQueryClient();
  const refreshExam = (id: string) =>
    Promise.all([
      cache.invalidateQueries({ queryKey: ["exam", id] }),
      cache.invalidateQueries({ queryKey: ["teacher-exams"] }),
    ]);
  const [d, setD] = useState<ExamInput>(
      exam
        ? { ...exam, passScorePercent: Number(exam.passScorePercent) }
        : defaults,
    ),
    [step, setStep] = useState(preview ? 4 : 0),
    [classes, setClasses] = useState(exam?.classes.map((c) => c.classId) || []),
    [fixed, setFixed] = useState(
      exam?.questions.map((q) => ({ ...q, points: Number(q.points) })) || [],
    ),
    [pools, setPools] = useState(
      exam?.pools.map((p) => ({ ...p, pointsEach: Number(p.pointsEach) })) ||
        [],
    ),
    [bank, setBank] = useState(""),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [error, setError] = useState<unknown>(),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const classPaging = useCatalogPage<{
    id: string;
    name: string;
    archivedAt: string | null;
  }>("classes", "/teacher/classes", false, "active");
  const cs = classPaging.query;
  const { user } = useAuth();
  const selectedClasses = useQueries({
    queries: classes.map((id) => ({
      queryKey: ["classes", "selected", user?.id, id],
      queryFn: () =>
        api<{ id: string; name: string; archivedAt: string | null }>(
          `/teacher/classes/${id}`,
        ),
      staleTime: 0,
    })),
  });
  const poolBanks = useQueries({
    queries: [
      ...new Set(pools.map((p) => p.questionBankId).filter(Boolean)),
    ].map((id) => ({
      queryKey: ["qb-banks", "selected", user?.id, id],
      queryFn: () =>
        api<{ id: string; title: string }>(`/teacher/question-banks/${id}`),
      staleTime: 0,
    })),
  });
  const qs = useQuery({
    queryKey: ["bank-questions", bank, page, search],
    queryFn: () =>
      api<{ items: QuestionDto[]; total: number }>(
        `/teacher/question-banks/${bank}/questions?page=${page}&search=${encodeURIComponent(search)}`,
      ),
    enabled: !!bank,
  });
  const patch = (v: Partial<ExamInput>) => {
    setNotice("");
    setD({ ...d, ...v });
  };
  async function save(publish = false) {
    setBusy(true);
    setError(undefined);
    try {
      const e = await api<ExamDto>(
        exam ? `/teacher/exams/${exam.id}` : "/teacher/exams",
        exam ? "PATCH" : "POST",
        d,
      );
      await api(`/teacher/exams/${e.id}/classes`, "PUT", { classIds: classes });
      await api(`/teacher/exams/${e.id}/questions`, "PUT", {
        questions: fixed.map((q) => ({
          questionId: q.questionId,
          points: q.points,
        })),
      });
      await api(`/teacher/exams/${e.id}/pools`, "PUT", { pools });
      if (publish) await api(`/teacher/exams/${e.id}/publish`, "POST");
      await refreshExam(e.id);
      setNotice(publish ? "Đã công bố bài thi" : "Đã lưu cấu hình");
      if (!exam || publish) nav("/teacher/exams");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const randomCount = pools.reduce((n, p) => n + p.pickCount, 0);
  const totalPoints =
    fixed.reduce((n, q) => n + q.points, 0) +
    pools.reduce((n, p) => n + p.pickCount * p.pointsEach, 0);
  const checklist = [
    { label: "Tên bài thi", complete: !!d.title.trim(), step: 0 },
    { label: "Lớp được giao", complete: classes.length > 0, step: 1 },
    {
      label: "Nguồn câu hỏi",
      complete: fixed.length + randomCount > 0,
      step: 2,
    },
    {
      label: "Lịch thi hợp lệ",
      complete:
        Date.parse(d.closeAt) > Date.parse(d.openAt) &&
        Date.parse(d.closeAt) > Date.now() &&
        d.durationMinutes > 0,
      step: 1,
    },
  ];
  const steps = [
    "Thông tin",
    "Lớp & lịch thi",
    "Câu hỏi",
    "Cài đặt",
    "Kiểm tra & công bố",
  ];
  // Advisory evidence, not a publish verdict or a record of visited tabs.
  const stepStates = [
    checklist[0]!.complete ? "Đã có tên" : "Chưa có tên",
    checklist[1]!.complete && checklist[3]!.complete
      ? "Đã có lớp & lịch"
      : "Cần bổ sung",
    checklist[2]!.complete ? "Đã có nguồn" : "Chưa có nguồn",
    d.maxAttempts > 0 && d.passScorePercent >= 0 && d.passScorePercent <= 100
      ? "Đã có quy tắc"
      : "Cần bổ sung",
    exam?.status === "PUBLISHED" ? "Đã công bố" : "Cần rà soát",
  ];
  const stepComplete = [
    checklist[0]!.complete,
    checklist[1]!.complete && checklist[3]!.complete,
    checklist[2]!.complete,
    d.maxAttempts > 0 && d.passScorePercent >= 0 && d.passScorePercent <= 100,
    exam?.status === "PUBLISHED",
  ];
  const classNames = classes.map(
    (id) =>
      selectedClasses.find((q) => q.data?.id === id)?.data?.name ||
      classPaging.items.find((c) => c.id === id)?.name ||
      `Lớp đã giao (${id})`,
  );
  const formatTime = (value: string) =>
    new Date(value).toLocaleString("vi-VN", {
      dateStyle: "short",
      timeStyle: "short",
    });
  const availability =
    Date.parse(d.closeAt) <= Date.now()
      ? "Đã qua giờ đóng"
      : Date.parse(d.openAt) > Date.now()
        ? "Chưa đến giờ mở"
        : "Trong khung giờ mở";
  return (
    <div className="exam-page exam-editor">
      <nav className="qb-breadcrumb" aria-label="Đường dẫn">
        <Link to="/teacher">Giảng viên</Link>
        <span>/</span>
        <Link to="/teacher/exams">Bài thi</Link>
        <span>/</span>
        <span>
          {preview ? "Xem trước" : exam ? "Chỉnh sửa" : "Tạo bài thi"}
        </span>
      </nav>
      <div className="qb-page-heading">
        <div>
          <p className="exam-context">
            {preview
              ? "Xem trước bài thi"
              : exam
                ? "Chỉnh sửa bài thi"
                : "Biên soạn / Bài thi mới"}
          </p>
          <h1>{d.title || "Tạo bài thi"}</h1>
          <p>Biên soạn nội dung, phân bổ điểm và chuẩn bị công bố.</p>
        </div>
        <ExamStatus status={exam?.status || "DRAFT"} />
      </div>
      {exam?.status === "PUBLISHED" && (
        <p className="exam-state-note">
          Bài thi đã công bố. Cấu hình chỉ có thể sửa khi chưa có lượt thi.
        </p>
      )}
      {exam?.status === "ARCHIVED" && (
        <p className="exam-state-note">
          Bài thi đã lưu trữ. Bạn có thể xem lại cấu hình và nội dung đề.
        </p>
      )}
      {preview && (
        <p className="exam-state-note">
          Bản xem trước dành cho giảng viên. Câu ngẫu nhiên được chọn khi sinh
          viên bắt đầu thi.
        </p>
      )}
      <p className="exam-current-section">
        Mục {String(step + 1).padStart(2, "0")} / 05 · {steps[step]}
      </p>
      <nav className="exam-steps" aria-label="Các bước thiết lập bài thi">
        {steps.map((s, i) => (
          <button
            className={step === i ? "exam-step-current" : "secondary"}
            aria-current={step === i ? "step" : undefined}
            data-complete={stepComplete[i]}
            key={s}
            onClick={() => setStep(i)}
          >
            <span className="exam-step-number">
              {String(i + 1).padStart(2, "0")}.
            </span>
            <span>
              {s}
              <small>
                <span aria-hidden="true">{stepComplete[i] ? "✓" : "○"} </span>
                {stepStates[i]}
              </small>
            </span>
          </button>
        ))}
      </nav>
      <ErrorNotice error={error} />
      <ErrorNotice
        error={
          cs.error || selectedClasses.find((q) => q.error)?.error || qs.error
        }
        retry={() => {
          void cs.refetch();
          selectedClasses.forEach((q) => void q.refetch());
          if (bank) void qs.refetch();
        }}
      />
      {notice && (
        <p className="exam-notice" role="status">
          {notice}
        </p>
      )}
      <div
        className={`exam-workspace exam-workspace-step-${step + 1} ${step === 2 ? "exam-workspace-questions" : ""}`}
      >
        <div className="exam-main-panel">
          <fieldset
            className="exam-fields"
            disabled={exam?.status === "ARCHIVED"}
          >
            {step === 0 && (
              <section className="exam-section exam-document-front">
                <div className="exam-section-heading">
                  <span className="exam-section-icon">01</span>
                  <div>
                    <h2>Thông tin bài thi</h2>
                    <p>
                      Giúp sinh viên nhận diện đúng bài kiểm tra và hiểu yêu
                      cầu.
                    </p>
                  </div>
                </div>
                <div className="exam-document-fields">
                  <Field label="Tên bài thi">
                    <input
                      placeholder="Ví dụ: Kiểm tra giữa kỳ · Công nghệ Web"
                      value={d.title}
                      onChange={(e) => patch({ title: e.target.value })}
                    />
                  </Field>
                  <Field label="Mô tả Markdown">
                    <textarea
                      value={d.descriptionMarkdown || ""}
                      onChange={(e) =>
                        patch({ descriptionMarkdown: e.target.value })
                      }
                    />
                  </Field>
                  <p className="exam-muted">
                    Hỗ trợ Markdown và công thức LaTeX.
                  </p>
                  <p className="exam-document-assignment">
                    <span>Lớp được giao</span>
                    {classNames.join(" · ") ||
                      "Chưa chọn lớp — thiết lập ở mục 02."}
                  </p>
                </div>
                {d.descriptionMarkdown && (
                  <div className="exam-description-preview">
                    <span className="exam-muted">Xem trước mô tả</span>
                    <Markdown>{d.descriptionMarkdown}</Markdown>
                  </div>
                )}
              </section>
            )}
            {step === 1 && (
              <section className="exam-section exam-schedule">
                <div className="exam-section-heading">
                  <span className="exam-section-icon">02</span>
                  <div>
                    <h2>Lớp & lịch thi</h2>
                    <p>
                      Chọn người tham gia, khung giờ mở bài và thời gian làm
                      bài.
                    </p>
                  </div>
                </div>
                <div className="exam-schedule-layout">
                  <div className="exam-schedule-classes">
                    <p className="exam-context">Đối tượng tham gia</p>
                    <h3>
                      Giao cho lớp{" "}
                      <span className="exam-muted">
                        · {classes.length} đã chọn
                      </span>
                    </h3>
                    <CatalogControls paging={classPaging} label="Tìm lớp" />
                    {cs.data && !classPaging.items.length && (
                      <p className="exam-muted">
                        Không có lớp phù hợp. Thử từ khóa khác hoặc tạo lớp
                        trong mục Lớp học.
                      </p>
                    )}
                    <div className="exam-class-list">
                      {classPaging.items.map((c) => (
                        <label className="choice" key={c.id}>
                          <input
                            type="checkbox"
                            checked={classes.includes(c.id)}
                            onChange={(e) =>
                              setClasses(
                                e.target.checked
                                  ? [...classes, c.id]
                                  : classes.filter((id) => id !== c.id),
                              )
                            }
                          />
                          {c.name}
                        </label>
                      ))}
                    </div>
                    <CatalogPager paging={classPaging} />
                    <ul className="catalog-selection" aria-label="Lớp đã chọn">
                      {classes.map((id, index) => (
                        <li key={id}>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() =>
                              setClasses(classes.filter((v) => v !== id))
                            }
                          >
                            Bỏ {classNames[index]}
                            {selectedClasses[index]?.data?.archivedAt
                              ? " · Đã lưu trữ"
                              : ""}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="exam-schedule-window">
                    <p className="exam-context">Khung thời gian</p>
                    <h3>Lịch mở bài & thời lượng</h3>
                    <p className="exam-muted">
                      Thời gian hiển thị theo múi giờ trên thiết bị. Mỗi lượt
                      thi có thời lượng riêng trong khung giờ mở bài.
                    </p>
                    <div className="exam-time-line">
                      <Field label="Mở bài (giờ địa phương)">
                        <input
                          type="datetime-local"
                          value={localDate(d.openAt)}
                          onChange={(e) => {
                            if (e.target.value)
                              patch({
                                openAt: new Date(e.target.value).toISOString(),
                              });
                          }}
                        />
                      </Field>
                      <Field label="Đóng bài">
                        <input
                          type="datetime-local"
                          value={localDate(d.closeAt)}
                          onChange={(e) => {
                            if (e.target.value)
                              patch({
                                closeAt: new Date(e.target.value).toISOString(),
                              });
                          }}
                        />
                      </Field>
                    </div>
                    <p
                      className={`exam-availability ${checklist[3]!.complete ? "" : "exam-check-missing"}`}
                    >
                      {checklist[3]!.complete
                        ? availability
                        : "Cần kiểm tra giờ đóng và thời lượng."}
                      <span>
                        Khung giờ chỉ có hiệu lực với bài thi đã công bố.
                      </span>
                    </p>
                    <div className="exam-form-grid">
                      <Field label="Thời lượng (phút)">
                        <input
                          type="number"
                          min="1"
                          value={d.durationMinutes}
                          onChange={(e) =>
                            patch({ durationMinutes: Number(e.target.value) })
                          }
                        />
                      </Field>
                      <Field label="Số lần thi">
                        <input
                          type="number"
                          min="1"
                          value={d.maxAttempts}
                          onChange={(e) =>
                            patch({ maxAttempts: Number(e.target.value) })
                          }
                        />
                      </Field>
                    </div>
                    <p className="exam-muted">
                      Mỗi lượt có thời lượng riêng và kết thúc chậm nhất khi bài
                      thi đóng.
                    </p>
                  </div>
                </div>
              </section>
            )}
            {step === 2 && (
              <>
                <section className="exam-section exam-question-section">
                  <div className="exam-section-heading">
                    <span className="exam-section-icon">03</span>
                    <div>
                      <h2>Chọn câu hỏi</h2>
                      <p>
                        Kết hợp câu cố định và câu ngẫu nhiên từ ngân hàng của
                        bạn.
                      </p>
                    </div>
                  </div>
                  <p className="exam-question-totals" role="status">
                    {fixed.length} câu cố định · {randomCount} câu ngẫu nhiên ·{" "}
                    {Number(totalPoints.toFixed(2))} điểm
                  </p>
                  <div className="exam-question-columns">
                    <div className="exam-question-source">
                      <p className="exam-context">Nguồn / Ngân hàng câu hỏi</p>
                      <h3>Thư viện câu hỏi</h3>
                      <BankPicker
                        value={bank}
                        onChange={(id) => {
                          setBank(id);
                          setPage(1);
                        }}
                      />
                      <Field label="Tìm câu hỏi">
                        <input
                          aria-label="Tìm câu hỏi"
                          placeholder="Tìm nội dung câu hỏi"
                          value={search}
                          onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                          }}
                        />
                      </Field>
                      {!bank && (
                        <p className="exam-empty-hint">
                          Chọn ngân hàng để xem và thêm câu hỏi vào đề.
                        </p>
                      )}
                      {bank && qs.isPending && (
                        <Skeleton label="Đang tải câu hỏi…" />
                      )}
                      {bank && qs.data?.items.length === 0 && (
                        <p className="exam-empty-hint">
                          Không có câu hỏi phù hợp. Thử từ khóa khác hoặc đổi
                          ngân hàng.
                        </p>
                      )}
                      <div className="exam-candidates">
                        {qs.data?.items.map((q) => (
                          <div
                            className={`choice exam-candidate ${fixed.some((f) => f.questionId === q.id) ? "is-selected" : ""}`}
                            key={q.id}
                          >
                            <label className="exam-question-check">
                              <input
                                type="checkbox"
                                aria-label={`Chọn ${q.promptMarkdown}`}
                                checked={fixed.some(
                                  (f) => f.questionId === q.id,
                                )}
                                onChange={(e) =>
                                  setFixed(
                                    e.target.checked
                                      ? [
                                          ...fixed,
                                          {
                                            questionId: q.id,
                                            points: Number(q.defaultPoints),
                                            question: q,
                                          },
                                        ]
                                      : fixed.filter(
                                          (f) => f.questionId !== q.id,
                                        ),
                                  )
                                }
                              />
                            </label>
                            <div>
                              <Markdown>{q.promptMarkdown}</Markdown>
                              <p className="exam-question-meta">
                                {typeLabels[q.type]} ·{" "}
                                {difficultyLabels[q.difficulty]} ·{" "}
                                {Number(q.defaultPoints)} điểm
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                      {bank && !qs.isPending && !qs.error && (
                        <Pager
                          page={page}
                          total={qs.data?.total || 0}
                          onChange={setPage}
                        />
                      )}
                    </div>
                    <div className="exam-selected">
                      <p className="exam-context">Cấu trúc / Câu cố định</p>
                      <h3>Đã chọn ({fixed.length})</h3>
                      <p className="exam-muted">
                        Các câu cố định xuất hiện trong mọi lượt thi.
                      </p>
                      {!fixed.length && (
                        <p className="exam-empty-hint">
                          Chưa chọn câu cố định. Chọn từ thư viện hoặc thêm nhóm
                          ngẫu nhiên bên dưới.
                        </p>
                      )}
                      {fixed.map((f, i) => (
                        <div className="exam-selected-row" key={f.questionId}>
                          <span className="exam-question-order">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <div className="exam-selected-content">
                            <Markdown>{f.question.promptMarkdown}</Markdown>
                            <p className="exam-question-meta">
                              {typeLabels[f.question.type]} ·{" "}
                              {difficultyLabels[f.question.difficulty]}
                            </p>
                          </div>
                          <div className="exam-question-score">
                            <Field label={`Điểm câu ${i + 1}`}>
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={f.points}
                                onChange={(e) =>
                                  setFixed(
                                    fixed.map((a, j) =>
                                      j === i
                                        ? {
                                            ...a,
                                            points: Number(e.target.value),
                                          }
                                        : a,
                                    ),
                                  )
                                }
                              />
                            </Field>
                            <button
                              className="secondary"
                              aria-label={`Bỏ câu ${i + 1}`}
                              onClick={() =>
                                setFixed(fixed.filter((_, j) => i !== j))
                              }
                            >
                              Bỏ
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
                <section className="exam-section exam-pools">
                  <h2>Nhóm câu hỏi ngẫu nhiên</h2>
                  <p className="exam-muted">
                    Mỗi lượt thi lấy số câu bạn chỉ định, không trùng với câu cố
                    định.
                  </p>
                  {!pools.length && (
                    <p className="exam-empty-hint">
                      Chưa có nhóm ngẫu nhiên. Bạn có thể dùng riêng câu cố
                      định.
                    </p>
                  )}
                  {pools.map((p, i) => (
                    <div className="exam-pool-row" key={i}>
                      <h3>
                        Nhóm {i + 1}{" "}
                        <span className="exam-muted">/ Quy tắc lấy câu</span>
                      </h3>
                      <div className="exam-pool-fields">
                        <BankPicker
                          label="Ngân hàng pool"
                          value={p.questionBankId}
                          onChange={(id) =>
                            setPools(
                              pools.map((a, j) =>
                                j === i ? { ...a, questionBankId: id } : a,
                              ),
                            )
                          }
                        />
                        <Field label="Số câu">
                          <input
                            type="number"
                            min="1"
                            value={p.pickCount}
                            onChange={(e) =>
                              setPools(
                                pools.map((a, j) =>
                                  j === i
                                    ? {
                                        ...a,
                                        pickCount: Number(e.target.value),
                                      }
                                    : a,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field label="Điểm mỗi câu">
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={p.pointsEach}
                            onChange={(e) =>
                              setPools(
                                pools.map((a, j) =>
                                  j === i
                                    ? {
                                        ...a,
                                        pointsEach: Number(e.target.value),
                                      }
                                    : a,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field label="Độ khó">
                          <select
                            value={p.difficultyFilter || ""}
                            onChange={(e) =>
                              setPools(
                                pools.map((a, j) =>
                                  j === i
                                    ? {
                                        ...a,
                                        difficultyFilter:
                                          (e.target
                                            .value as typeof p.difficultyFilter) ||
                                          null,
                                      }
                                    : a,
                                ),
                              )
                            }
                          >
                            <option value="">Tất cả</option>
                            <option value="EASY">Dễ</option>
                            <option value="MEDIUM">Trung bình</option>
                            <option value="HARD">Khó</option>
                          </select>
                        </Field>
                        <Field label="Tags">
                          <input
                            value={p.tagFilter.join(",")}
                            onChange={(e) =>
                              setPools(
                                pools.map((a, j) =>
                                  j === i
                                    ? {
                                        ...a,
                                        tagFilter: e.target.value
                                          .split(",")
                                          .filter(Boolean),
                                      }
                                    : a,
                                ),
                              )
                            }
                          />
                        </Field>
                        <button
                          className="qb-text-danger"
                          aria-label={`Bỏ nhóm ${i + 1}`}
                          onClick={() =>
                            setPools(pools.filter((_, j) => i !== j))
                          }
                        >
                          Bỏ nhóm
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    className="secondary"
                    onClick={() =>
                      setPools([
                        ...pools,
                        {
                          questionBankId: bank,
                          pickCount: 1,
                          pointsEach: 1,
                          tagFilter: [],
                          difficultyFilter: null,
                        },
                      ])
                    }
                  >
                    Thêm nhóm ngẫu nhiên
                  </button>
                </section>
              </>
            )}
            {step === 3 && (
              <section className="exam-section exam-settings">
                <div className="exam-section-heading">
                  <span className="exam-section-icon">04</span>
                  <div>
                    <h2>Quy tắc & kết quả</h2>
                    <p>
                      Thiết lập cách tính điểm và nội dung sinh viên được xem.
                    </p>
                  </div>
                </div>
                <div className="exam-setting-group">
                  <div>
                    <h3>Tính điểm</h3>
                    <p className="exam-muted">
                      Cách chọn kết quả khi sinh viên có nhiều lượt thi.
                    </p>
                  </div>
                  <div className="exam-setting-controls">
                    <Field label="Chiến lược kết quả">
                      <select
                        value={d.resultStrategy}
                        onChange={(e) =>
                          patch({
                            resultStrategy: e.target
                              .value as ExamInput["resultStrategy"],
                          })
                        }
                      >
                        <option value="HIGHEST_SCORE">Lấy điểm cao nhất</option>
                        <option value="LATEST_ATTEMPT">
                          Lấy lần thi gần nhất
                        </option>
                      </select>
                    </Field>
                    <Field label="Ngưỡng đạt (%)">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={d.passScorePercent}
                        onChange={(e) =>
                          patch({ passScorePercent: Number(e.target.value) })
                        }
                      />
                    </Field>
                  </div>
                </div>
                <div className="exam-setting-group">
                  <div>
                    <h3>Thứ tự trong đề</h3>
                    <p className="exam-muted">
                      Áp dụng cho từng lượt thi. Nguồn câu ngẫu nhiên được thiết
                      lập ở mục 03.
                    </p>
                  </div>
                  <div>
                    {(
                      [
                        ["shuffleQuestions", "Xáo trộn câu hỏi"],
                        ["shuffleOptions", "Xáo trộn lựa chọn"],
                      ] as const
                    ).map(([k, label]) => (
                      <label className="choice" key={k}>
                        <input
                          type="checkbox"
                          checked={d[k]}
                          onChange={(e) => patch({ [k]: e.target.checked })}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="exam-setting-group">
                  <div>
                    <h3>Sau khi làm bài</h3>
                    <p className="exam-muted">
                      Thời điểm công bố và những nội dung sinh viên được xem
                      trong kết quả.
                    </p>
                  </div>
                  <div>
                    <Field label="Công bố kết quả">
                      <select
                        value={d.resultReleaseMode}
                        onChange={(e) =>
                          patch({
                            resultReleaseMode: e.target
                              .value as ExamInput["resultReleaseMode"],
                          })
                        }
                      >
                        <option value="IMMEDIATE">Ngay sau khi nộp bài</option>
                        <option value="AFTER_CLOSE">
                          Sau khi đóng bài thi
                        </option>
                        <option value="MANUAL">
                          Giảng viên công bố thủ công
                        </option>
                      </select>
                    </Field>
                    {(
                      [
                        ["showCorrectAnswers", "Cho xem đáp án đúng"],
                        ["showExplanations", "Cho xem giải thích"],
                        ["showDetailedScore", "Cho xem điểm từng câu"],
                      ] as const
                    ).map(([k, label]) => (
                      <label className="choice" key={k}>
                        <input
                          type="checkbox"
                          checked={d[k]}
                          onChange={(e) => patch({ [k]: e.target.checked })}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </section>
            )}
            {step === 4 && (
              <section className="exam-section exam-review">
                <div className="exam-section-heading">
                  <span className="exam-section-icon">05</span>
                  <div>
                    <h2>Kiểm tra & công bố</h2>
                    <p>
                      Rà soát cấu hình và nội dung đề trước khi giao cho lớp.
                    </p>
                  </div>
                </div>
                <div className="exam-review-cover">
                  <ExamStatus status={exam?.status || "DRAFT"} />
                  <h2>{d.title || "Chưa nhập tên"}</h2>
                  <Markdown>{d.descriptionMarkdown || ""}</Markdown>
                  <dl className="exam-review-facts">
                    <div>
                      <dt>Giao cho</dt>
                      <dd>{classNames.join(" · ") || "Chưa chọn lớp"}</dd>
                    </div>
                    <div>
                      <dt>Lịch mở bài</dt>
                      <dd>
                        {formatTime(d.openAt)} → {formatTime(d.closeAt)}
                      </dd>
                    </div>
                    <div>
                      <dt>Mỗi lượt thi</dt>
                      <dd>
                        {d.durationMinutes} phút · Tối đa {d.maxAttempts} lượt
                      </dd>
                    </div>
                    <div>
                      <dt>Cấu trúc đề</dt>
                      <dd>
                        {fixed.length} câu cố định + {randomCount} câu ngẫu
                        nhiên · {Number(totalPoints.toFixed(2))} điểm
                      </dd>
                    </div>
                    <div>
                      <dt>Kết quả</dt>
                      <dd>
                        {resultLabels[d.resultStrategy]} · Đạt từ{" "}
                        {d.passScorePercent}%<br />
                        {releaseLabels[d.resultReleaseMode]}
                      </dd>
                    </div>
                    <div>
                      <dt>Thứ tự</dt>
                      <dd>
                        {d.shuffleQuestions
                          ? "Trộn câu hỏi"
                          : "Giữ thứ tự câu hỏi"}{" "}
                        ·{" "}
                        {d.shuffleOptions
                          ? "Trộn lựa chọn"
                          : "Giữ thứ tự lựa chọn"}
                      </dd>
                    </div>
                    <div>
                      <dt>Nội dung kết quả</dt>
                      <dd>
                        {[
                          d.showCorrectAnswers && "Đáp án đúng",
                          d.showExplanations && "Giải thích",
                          d.showDetailedScore && "Điểm từng câu",
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Không hiển thị chi tiết"}
                      </dd>
                    </div>
                  </dl>
                </div>
                {checklist.some((item) => !item.complete) && (
                  <div className="exam-review-missing">
                    <h3>Cần bổ sung trước khi công bố</h3>
                    <ul>
                      {checklist
                        .filter((item) => !item.complete)
                        .map((item) => (
                          <li key={item.label}>{item.label}</li>
                        ))}
                    </ul>
                  </div>
                )}
                <div className="exam-review-contents">
                  <h3>
                    Câu cố định{" "}
                    <span className="exam-muted">/ {fixed.length} câu</span>
                  </h3>
                  {!fixed.length && (
                    <p className="exam-muted">Chưa có câu cố định.</p>
                  )}
                  {fixed.map((q, i) => (
                    <div className="exam-review-question" key={q.questionId}>
                      <span className="exam-question-order">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="exam-review-prompt">
                        <Markdown>{q.question.promptMarkdown}</Markdown>
                        <p className="exam-question-meta">
                          {typeLabels[q.question.type]} ·{" "}
                          {difficultyLabels[q.question.difficulty]}
                        </p>
                        {q.question.options.map((o) => (
                          <div className="exam-review-option" key={o.id}>
                            <span aria-hidden="true">○</span>
                            <Markdown>{o.contentMarkdown}</Markdown>
                          </div>
                        ))}
                      </div>
                      <span className="exam-review-points">
                        {q.points} điểm
                      </span>
                    </div>
                  ))}
                </div>
                <div className="exam-review-pools">
                  <h3>
                    Nhóm ngẫu nhiên{" "}
                    <span className="exam-muted">/ {randomCount} câu</span>
                  </h3>
                  {!pools.length && (
                    <p className="exam-muted">Không có nhóm ngẫu nhiên.</p>
                  )}
                  {pools.map((p, i) => (
                    <p key={i}>
                      <strong>Nhóm {i + 1}</strong> ·{" "}
                      {poolBanks.find((q) => q.data?.id === p.questionBankId)
                        ?.data?.title || "Ngân hàng đã chọn"}
                      <br /> {p.pickCount} câu · {p.pointsEach} điểm/câu ·{" "}
                      {p.difficultyFilter
                        ? difficultyLabels[p.difficultyFilter]
                        : "Mọi độ khó"}{" "}
                      · {p.tagFilter.join(", ")}
                    </p>
                  ))}
                </div>
                <p className="exam-muted">
                  Máy chủ kiểm tra lịch, lớp, nguồn câu hỏi và khả năng chọn
                  không trùng khi công bố.
                </p>
              </section>
            )}
          </fieldset>
        </div>
        <aside className="exam-summary" aria-label="Tóm tắt bài thi">
          <p className="exam-context">Ghi chú biên soạn</p>
          <h2>{d.title || "Bài thi mới"}</h2>
          <dl className="exam-summary-metrics">
            <div>
              <dt>Câu hỏi</dt>
              <dd>{fixed.length + randomCount}</dd>
            </div>
            <div>
              <dt>Tổng điểm</dt>
              <dd>{Number(totalPoints.toFixed(2))}</dd>
            </div>
            <div>
              <dt>Phút / lượt</dt>
              <dd>{d.durationMinutes}</dd>
            </div>
            <div>
              <dt>Lớp được giao</dt>
              <dd>{classes.length}</dd>
            </div>
          </dl>
          <h3>Trước khi công bố</h3>
          <ul className="exam-checklist">
            {checklist.map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setStep(item.step)}
                >
                  <span
                    className={
                      item.complete ? "exam-check-done" : "exam-check-missing"
                    }
                    aria-hidden="true"
                  >
                    {item.complete ? "✓" : "○"}
                  </span>
                  <span>{item.label}</span>
                  <small>{item.complete ? "Đã có" : "Còn thiếu"}</small>
                </button>
              </li>
            ))}
          </ul>
          <p className="exam-muted">
            {checklist.every((item) => item.complete)
              ? "Đã có thông tin cơ bản. Hãy kiểm tra nội dung đề trước khi công bố."
              : "Bạn có thể lưu bản nháp và hoàn thiện sau."}{" "}
            Nguồn câu hỏi và quy tắc được kiểm tra khi công bố.
          </p>
        </aside>
      </div>
      <div className="exam-editor-actions">
        <div className="exam-step-actions">
          <button
            disabled={step === 0}
            className="secondary"
            onClick={() => setStep(step - 1)}
          >
            Trước
          </button>
          <button
            disabled={step === 4}
            className="secondary"
            onClick={() => setStep(step + 1)}
          >
            Tiếp
          </button>
        </div>
        <div className="exam-save-actions">
          {!preview && (
            <>
              <button
                className={!exam || exam.status === "DRAFT" ? "secondary" : ""}
                disabled={busy || exam?.status === "ARCHIVED"}
                onClick={() => save()}
              >
                Lưu bài thi
              </button>
              {(!exam || exam.status === "DRAFT") && (
                <button disabled={busy} onClick={() => save(true)}>
                  Lưu & công bố
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="exam-secondary-actions">
        <Link to="/teacher/exams">← Về danh sách bài thi</Link>
        {exam && exam.status !== "ARCHIVED" && (
          <ConfirmAction
            label="Lưu trữ bài thi"
            title="Lưu trữ bài thi?"
            disabled={busy}
            onConfirm={async () => {
              await api(`/teacher/exams/${exam.id}/archive`, "POST");
              await refreshExam(exam.id);
              nav("/teacher/exams");
            }}
          >
            <p>
              Bài thi sẽ được chuyển sang trạng thái lưu trữ. Bạn vẫn có thể xem
              lại nội dung và kết quả đã có.
            </p>
          </ConfirmAction>
        )}
      </div>
    </div>
  );
}
