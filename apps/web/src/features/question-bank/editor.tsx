import { memo, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { questionSchema, type QuestionInput } from "@exam/shared";
import { api } from "../../lib/api";
import { Field } from "./ui";
import { Markdown } from "../../components/Markdown";
import { type Bank, type BankQuestion, useCatalogRefresh } from "./banks";
import {
  ConfirmAction,
  DirtyGuard,
  ErrorNotice,
  Skeleton,
  Status,
  difficultyLabels,
  typeLabels,
} from "./ui";
const initial: QuestionInput = {
  type: "SINGLE_CHOICE",
  promptMarkdown: "",
  explanationMarkdown: "",
  defaultPoints: 1,
  difficulty: "MEDIUM",
  tags: [],
  options: [
    { contentMarkdown: "", isCorrect: true },
    { contentMarkdown: "", isCorrect: false },
  ],
};
function inputOf(q: BankQuestion): QuestionInput {
  return {
    type: q.type,
    promptMarkdown: q.promptMarkdown,
    explanationMarkdown: q.explanationMarkdown || "",
    defaultPoints: Number(q.defaultPoints),
    difficulty: q.difficulty,
    tags: q.tags,
    options: q.options.map((o) => ({
      contentMarkdown: o.contentMarkdown,
      isCorrect: o.isCorrect,
    })),
  };
}
const Preview = memo(function Preview({ value }: { value: QuestionInput }) {
  return (
    <>
      <div className="qb-preview-label">
        <span>BẢN XEM TRƯỚC</span>
        <span>{Number(value.defaultPoints) || 0} điểm</span>
      </div>
      {value.promptMarkdown ? (
        <Markdown>{value.promptMarkdown}</Markdown>
      ) : (
        <p className="qb-muted">Nội dung câu hỏi sẽ xuất hiện tại đây.</p>
      )}
      {value.options.map((o, i) => (
        <div
          className={`qb-preview-option ${o.isCorrect ? "correct" : ""}`}
          key={i}
        >
          <span className="qb-option-letter">
            {String.fromCharCode(65 + i)}
          </span>
          <Markdown>
            {value.type === "TRUE_FALSE"
              ? i === 0
                ? "Đúng"
                : "Sai"
              : o.contentMarkdown || `Lựa chọn ${i + 1}`}
          </Markdown>
          {o.isCorrect && <span className="qb-answer-label">Đúng</span>}
        </div>
      ))}
      {value.type === "ESSAY" && (
        <div className="qb-essay-placeholder">
          Sinh viên nhập câu trả lời tự luận.
        </div>
      )}
      {value.explanationMarkdown && (
        <div className="qb-explanation">
          <h3>Lời giải</h3>
          <Markdown>{value.explanationMarkdown}</Markdown>
        </div>
      )}
      <p className="qb-preview-note">
        Đây là bản xem trước của giảng viên, có hiển thị đáp án và lời giải.
      </p>
    </>
  );
});
export function QuestionEditor() {
  const { id, questionId } = useParams();
  const q = useQuery({
    queryKey: ["qb-question", questionId],
    queryFn: () => api<BankQuestion>(`/teacher/questions/${questionId}`),
    enabled: !!questionId,
    refetchOnWindowFocus: false,
  });
  const bank = useQuery({
    queryKey: ["qb-bank", id],
    queryFn: () => api<Bank>(`/teacher/question-banks/${id}`),
    enabled: !!id,
  });
  if (questionId ? q.isPending : bank.isPending)
    return <Skeleton label="Đang mở trình soạn câu hỏi…" />;
  if (q.error || bank.error)
    return (
      <ErrorNotice
        error={q.error || bank.error}
        retry={() => void (questionId ? q.refetch() : bank.refetch())}
      />
    );
  const b = q.data?.bank || bank.data;
  if (!b) return null;
  return <QuestionForm key={questionId || id} question={q.data} bank={b} />;
}
function QuestionForm({
  question,
  bank,
}: {
  question?: BankQuestion;
  bank: Bank;
}) {
  const nav = useNavigate(),
    cache = useQueryClient(),
    refresh = useCatalogRefresh();
  const [d, setD] = useState<QuestionInput>(() =>
    question ? inputOf(question) : structuredClone(initial),
  );
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify(question ? inputOf(question) : initial),
  );
  const [tags, setTags] = useState(d.tags.join(", ")),
    [error, setError] = useState<unknown>(),
    [issues, setIssues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [tab, setTab] = useState("edit"),
    [redirect, setRedirect] = useState("");
  const [file, setFile] = useState<File | null>(null),
    [fileUrl, setFileUrl] = useState(""),
    [mediaError, setMediaError] = useState(""),
    [target, setTarget] = useState<"promptMarkdown" | "explanationMarkdown">(
      "promptMarkdown",
    );
  const [replaceToken, setReplaceToken] = useState(""),
    [archived, setArchived] = useState(question?.isArchived || false);
  const activeId = useRef(question?.id),
    uploaded = useRef<string | undefined>(undefined),
    saving = useRef(false),
    form = useRef<HTMLFormElement>(null);
  const readOnly = archived || bank.isArchived;
  const dirty =
    JSON.stringify(d) !== baseline || !!file || tags !== d.tags.join(", ");
  useEffect(() => {
    if (!file) {
      setFileUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (redirect) nav(redirect, { replace: true });
  }, [redirect, nav]);
  const patch = (value: Partial<QuestionInput>) => {
    setD((old) => ({ ...old, ...value }));
    setNotice("");
  };
  const showIssue = (key: string) =>
    issues[key] && (
      <p className="qb-field-error" id={`error-${key}`}>
        {issues[key]}
      </p>
    );
  const assets = (["promptMarkdown", "explanationMarkdown"] as const).flatMap(
    (key) =>
      Array.from(
        (d[key] || "").matchAll(/!\[([^\]]*)\]\((asset:[\da-f-]{36})\)/g),
      ).map((m) => ({ key, token: m[0], alt: m[1], src: m[2] })),
  );
  async function save() {
    if (saving.current || readOnly) return;
    const data = {
      ...d,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    const parsed = questionSchema.safeParse(data),
      found: Record<string, string> = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        found[key] =
          key === "options"
            ? "Cần 2–20 lựa chọn có nội dung và đáp án đúng phù hợp loại câu hỏi."
            : key === "promptMarkdown"
              ? "Nhập nội dung câu hỏi, tối đa 50.000 ký tự."
              : key === "defaultPoints"
                ? "Điểm phải lớn hơn 0 và không vượt quá 10.000."
                : key === "tags"
                  ? "Tối đa 20 thẻ, mỗi thẻ không quá 60 ký tự."
                  : "Nội dung quá dài hoặc không hợp lệ.";
      }
    setIssues(found);
    if (!parsed.success) {
      setTab("edit");
      setTimeout(
        () =>
          form.current
            ?.querySelector<HTMLElement>('[aria-invalid="true"]')
            ?.focus(),
        0,
      );
      return;
    }
    if (mediaError) return;
    saving.current = true;
    setBusy(true);
    setError(undefined);
    setNotice("Đang lưu nội dung…");
    let contentSaved = false;
    try {
      const saved = await api<BankQuestion>(
        activeId.current
          ? `/teacher/questions/${activeId.current}`
          : `/teacher/question-banks/${bank.id}/questions`,
        activeId.current ? "PATCH" : "POST",
        parsed.data,
      );
      activeId.current = saved.id;
      contentSaved = true;
      let finalData = parsed.data,
        result = saved;
      if (file) {
        setNotice(
          uploaded.current
            ? "Đang hoàn tất ảnh…"
            : "Đã lưu nội dung. Đang tải ảnh…",
        );
        if (!uploaded.current) {
          const body = new FormData();
          body.set("file", file);
          body.set("altText", "Hình minh họa");
          const a = await api<{ id: string }>(
            `/teacher/questions/${saved.id}/assets`,
            "POST",
            body,
          );
          uploaded.current = a.id;
        }
        const markup = `![Hình minh họa](asset:${uploaded.current})`;
        const old = finalData[target] || "";
        finalData = {
          ...finalData,
          [target]:
            replaceToken && old.includes(replaceToken)
              ? old.replace(replaceToken, markup)
              : `${old}\n${markup}`,
        };
        setNotice("Đã tải ảnh. Đang lưu câu hỏi có ảnh…");
        result = await api<BankQuestion>(
          `/teacher/questions/${saved.id}`,
          "PATCH",
          finalData,
        );
      }
      setD(finalData);
      setTags(finalData.tags.join(", "));
      setBaseline(JSON.stringify(finalData));
      setFile(null);
      uploaded.current = undefined;
      setReplaceToken("");
      cache.setQueryData(["qb-question", result.id], { ...result, bank });
      await refresh();
      setNotice("Đã lưu câu hỏi" + (file ? " và ảnh." : "."));
      if (!question) setRedirect(`/teacher/questions/${result.id}/edit`);
    } catch (e) {
      setError(e);
      setNotice(
        contentSaved && file
          ? "Nội dung đã được lưu; ảnh chưa hoàn tất. Giữ trang này và bấm Lưu câu hỏi để thử lại."
          : "Chưa lưu được thay đổi. Bạn có thể thử lại.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <DirtyGuard dirty={dirty} busy={busy} />
      <nav className="qb-breadcrumb" aria-label="Đường dẫn">
        <Link to="/teacher/question-banks">Ngân hàng câu hỏi</Link>
        <span>/</span>
        <Link to={`/teacher/question-banks/${bank.id}`}>{bank.title}</Link>
        <span>/</span>
        <span aria-current="page">
          {question ? "Chỉnh sửa câu hỏi" : "Câu hỏi mới"}
        </span>
      </nav>
      <div className="qb-page-heading">
        <div>
          <p className="qb-kicker">{bank.subject || "BIÊN SOẠN"}</p>
          <h1>{question ? "Chỉnh sửa câu hỏi" : "Tạo câu hỏi"}</h1>
          <p>Soạn nội dung và kiểm tra bản xem trước trước khi lưu.</p>
        </div>
        <Status archived={readOnly} />
      </div>
      {question && !bank.isArchived && (
        <div className="qb-editor-lifecycle">
          <ConfirmAction
            label={archived ? "Khôi phục câu hỏi" : "Lưu trữ câu hỏi"}
            title={archived ? "Khôi phục câu hỏi?" : "Lưu trữ câu hỏi?"}
            disabled={busy || dirty}
            danger={!archived}
            onConfirm={async () => {
              await api(
                `/teacher/questions/${question.id}${archived ? "/restore" : ""}`,
                archived ? "POST" : "DELETE",
              );
              setArchived(!archived);
              await cache.invalidateQueries({
                queryKey: ["qb-question", question.id],
              });
              await refresh();
              setNotice(
                archived
                  ? "Đã khôi phục câu hỏi."
                  : "Đã lưu trữ câu hỏi. Lịch sử bài làm được giữ nguyên.",
              );
            }}
          >
            <p className="qb-confirm-prompt">
              {d.promptMarkdown.slice(0, 180)}
            </p>
            <p>
              {archived
                ? "Đưa câu hỏi trở lại danh sách đang dùng."
                : "Ẩn khỏi danh sách đang dùng. Có thể khôi phục; không xóa lịch sử bài thi."}
            </p>
          </ConfirmAction>
          {dirty && (
            <span className="qb-help">
              Lưu hoặc hủy thay đổi trước khi lưu trữ.
            </span>
          )}
        </div>
      )}
      {readOnly && (
        <div className="qb-warning">
          {bank.isArchived
            ? "Ngân hàng đã lưu trữ. Hãy khôi phục ngân hàng trước."
            : "Câu hỏi đã lưu trữ. Khôi phục để chỉnh sửa và sử dụng lại."}
        </div>
      )}
      <ErrorNotice error={error} />
      {Object.keys(issues).length > 0 && (
        <p role="alert" className="qb-error">
          Kiểm tra các trường được đánh dấu bên dưới. Nội dung chưa được lưu.
        </p>
      )}
      <div
        className="qb-editor-tabs"
        role="tablist"
        aria-label="Trình soạn câu hỏi"
        onKeyDown={(e) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
            return;
          e.preventDefault();
          const next =
            e.key === "Home"
              ? "edit"
              : e.key === "End"
                ? "preview"
                : tab === "edit"
                  ? "preview"
                  : "edit";
          setTab(next);
          document.getElementById(`qb-${next}-tab`)?.focus();
        }}
      >
        <button
          type="button"
          role="tab"
          id="qb-edit-tab"
          aria-controls="qb-edit-panel"
          tabIndex={tab === "edit" ? 0 : -1}
          aria-selected={tab === "edit"}
          onClick={() => setTab("edit")}
        >
          Soạn thảo
        </button>
        <button
          type="button"
          role="tab"
          id="qb-preview-tab"
          aria-controls="qb-preview-panel"
          tabIndex={tab === "preview" ? 0 : -1}
          aria-selected={tab === "preview"}
          onClick={() => setTab("preview")}
        >
          Xem trước
        </button>
      </div>
      <form
        ref={form}
        id="question-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className={`qb-editor-layout qb-tab-${tab}`}>
          <div className="qb-editor-fields" id="qb-edit-panel">
            <fieldset disabled={busy || readOnly}>
              <section className="qb-editor-section">
                <div className="qb-section-title">
                  <h2>
                    <span className="qb-section-number">01</span> Nội dung câu
                    hỏi
                  </h2>
                </div>
                <div className="qb-section-body">
                  <Field label="Loại câu hỏi">
                    <select
                      value={d.type}
                      onChange={(e) => {
                        const type = e.target.value as QuestionInput["type"];
                        patch({
                          type,
                          options:
                            type === "ESSAY"
                              ? []
                              : type === "TRUE_FALSE"
                                ? [
                                    {
                                      contentMarkdown: "True",
                                      isCorrect: true,
                                    },
                                    {
                                      contentMarkdown: "False",
                                      isCorrect: false,
                                    },
                                  ]
                                : structuredClone(initial.options),
                        });
                      }}
                    >
                      {Object.entries(typeLabels).map(([v, label]) => (
                        <option value={v} key={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Nội dung câu hỏi">
                    <textarea
                      rows={7}
                      value={d.promptMarkdown}
                      maxLength={50000}
                      aria-invalid={!!issues.promptMarkdown}
                      aria-describedby={
                        issues.promptMarkdown
                          ? "error-promptMarkdown"
                          : "prompt-help"
                      }
                      placeholder="Nhập câu hỏi của bạn…"
                      onChange={(e) =>
                        patch({ promptMarkdown: e.target.value })
                      }
                    />
                  </Field>
                  {showIssue("promptMarkdown")}
                  <p className="qb-help" id="prompt-help">
                    Hỗ trợ **in đậm**, $công thức LaTeX$ và khối code bằng ```.
                  </p>
                </div>
              </section>
              {d.type !== "ESSAY" && (
                <section className="qb-editor-section">
                  <div className="qb-section-title">
                    <h2>
                      <span className="qb-section-number">02</span> Lựa chọn &
                      đáp án
                    </h2>
                  </div>
                  <div className="qb-section-body">
                    <p className="qb-help">
                      {d.type === "MULTIPLE_CHOICE"
                        ? "Đánh dấu tất cả đáp án đúng."
                        : "Chọn một đáp án đúng."}
                    </p>
                    <div
                      aria-invalid={!!issues.options}
                      tabIndex={issues.options ? -1 : undefined}
                      aria-describedby={
                        issues.options ? "error-options" : undefined
                      }
                    >
                      {d.options.map((o, i) => (
                        <div className="qb-option-editor" key={i}>
                          <input
                            aria-label={`Đáp án đúng ${i + 1}`}
                            type={
                              d.type === "MULTIPLE_CHOICE"
                                ? "checkbox"
                                : "radio"
                            }
                            name="correct-option"
                            checked={o.isCorrect}
                            onChange={(e) =>
                              patch({
                                options: d.options.map((a, j) => ({
                                  ...a,
                                  isCorrect:
                                    j === i
                                      ? e.target.checked
                                      : d.type === "MULTIPLE_CHOICE"
                                        ? a.isCorrect
                                        : false,
                                })),
                              })
                            }
                          />
                          <span className="qb-option-letter">
                            {String.fromCharCode(65 + i)}
                          </span>
                          {d.type === "TRUE_FALSE" ? (
                            <span className="qb-option-input">
                              {i === 0 ? "Đúng" : "Sai"}
                            </span>
                          ) : (
                            <textarea
                              aria-label={`Lựa chọn ${i + 1}`}
                              className="qb-option-input"
                              rows={2}
                              maxLength={10000}
                              value={o.contentMarkdown}
                              placeholder={`Nội dung lựa chọn ${i + 1}`}
                              onChange={(e) =>
                                patch({
                                  options: d.options.map((a, j) =>
                                    j === i
                                      ? {
                                          ...a,
                                          contentMarkdown: e.target.value,
                                        }
                                      : a,
                                  ),
                                })
                              }
                            />
                          )}
                          {d.type !== "TRUE_FALSE" && (
                            <button
                              type="button"
                              className="qb-icon-button secondary"
                              disabled={d.options.length <= 2}
                              aria-label={`Xóa lựa chọn ${i + 1}`}
                              onClick={() =>
                                patch({
                                  options: d.options.filter((_, j) => j !== i),
                                })
                              }
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {showIssue("options")}
                    {["SINGLE_CHOICE", "MULTIPLE_CHOICE"].includes(d.type) && (
                      <button
                        type="button"
                        className="secondary"
                        disabled={d.options.length >= 20}
                        onClick={() =>
                          patch({
                            options: [
                              ...d.options,
                              { contentMarkdown: "", isCorrect: false },
                            ],
                          })
                        }
                      >
                        ＋ Thêm lựa chọn
                      </button>
                    )}
                  </div>
                </section>
              )}
              <section className="qb-editor-section">
                <div className="qb-section-title">
                  <h2>Thông tin & lời giải</h2>
                </div>
                <div className="qb-section-body">
                  <div className="qb-form-row">
                    <Field label="Điểm">
                      <input
                        type="number"
                        min="0.01"
                        max="10000"
                        step="0.01"
                        value={d.defaultPoints}
                        aria-invalid={!!issues.defaultPoints}
                        aria-describedby={
                          issues.defaultPoints
                            ? "error-defaultPoints"
                            : undefined
                        }
                        onChange={(e) =>
                          patch({ defaultPoints: Number(e.target.value) })
                        }
                      />
                    </Field>
                    <Field label="Độ khó">
                      <select
                        value={d.difficulty}
                        onChange={(e) =>
                          patch({
                            difficulty: e.target
                              .value as QuestionInput["difficulty"],
                          })
                        }
                      >
                        {Object.entries(difficultyLabels).map(([v, label]) => (
                          <option value={v} key={v}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  {showIssue("defaultPoints")}
                  <Field label="Thẻ phân loại">
                    <input
                      value={tags}
                      aria-invalid={!!issues.tags}
                      aria-describedby="tags-help"
                      placeholder="Ví dụ: HTTP, Session, Bảo mật"
                      onChange={(e) => {
                        setTags(e.target.value);
                        setNotice("");
                      }}
                    />
                  </Field>
                  <p className="qb-help" id="tags-help">
                    Phân cách bằng dấu phẩy, tối đa 20 thẻ.
                  </p>
                  {showIssue("tags")}
                  <Field label="Lời giải">
                    <textarea
                      rows={4}
                      value={d.explanationMarkdown || ""}
                      maxLength={50000}
                      onChange={(e) =>
                        patch({ explanationMarkdown: e.target.value })
                      }
                    />
                  </Field>
                  <p className="qb-help">
                    Lời giải hiển thị cho sinh viên theo chính sách công bố kết
                    quả của bài thi.
                  </p>
                </div>
              </section>
              <section className="qb-editor-section">
                <div className="qb-section-title">
                  <h2>Ảnh minh họa</h2>
                </div>
                <div className="qb-section-body">
                  <p className="qb-help">
                    Chọn PNG, JPEG hoặc WebP, tối đa 5 MB. Ảnh được tải và gắn
                    vào câu hỏi khi bạn bấm Lưu.
                  </p>
                  {assets.map((a, i) => (
                    <div className="qb-attached-image" key={`${a.key}-${i}`}>
                      <Markdown>{a.token}</Markdown>
                      <span>
                        {a.key === "promptMarkdown"
                          ? "Trong câu hỏi"
                          : "Trong lời giải"}
                      </span>
                      <div className="qb-row-actions">
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => {
                            setTarget(a.key);
                            setReplaceToken(a.token);
                            form.current
                              ?.querySelector<HTMLInputElement>(
                                'input[type="file"]',
                              )
                              ?.click();
                          }}
                        >
                          Thay ảnh {i + 1}
                        </button>
                        <button
                          type="button"
                          className="qb-text-danger"
                          onClick={() =>
                            patch({
                              [a.key]: (d[a.key] || "").replace(a.token, ""),
                            })
                          }
                        >
                          Gỡ ảnh {i + 1}
                        </button>
                      </div>
                    </div>
                  ))}
                  <Field label="Vị trí ảnh mới">
                    <select
                      value={target}
                      onChange={(e) => {
                        setTarget(e.target.value as typeof target);
                        setReplaceToken("");
                      }}
                    >
                      <option value="promptMarkdown">Nội dung câu hỏi</option>
                      <option value="explanationMarkdown">Lời giải</option>
                    </select>
                  </Field>
                  <Field label="Chọn ảnh">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      aria-describedby="image-status"
                      onChange={(e) => {
                        const picked = e.target.files?.[0];
                        e.target.value = "";
                        if (!picked) return;
                        if (
                          !["image/png", "image/jpeg", "image/webp"].includes(
                            picked.type,
                          )
                        ) {
                          setMediaError("Chỉ nhận ảnh PNG, JPEG hoặc WebP.");
                          return;
                        }
                        if (picked.size > 5 * 1024 * 1024) {
                          setMediaError(
                            "Ảnh vượt giới hạn 5 MB. Hãy chọn ảnh nhỏ hơn.",
                          );
                          return;
                        }
                        setMediaError("");
                        setFile(picked);
                        uploaded.current = undefined;
                        setNotice("");
                      }}
                    />
                  </Field>
                  {mediaError && (
                    <p role="alert" className="qb-field-error">
                      {mediaError}
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setMediaError("")}
                      >
                        Bỏ qua ảnh không hợp lệ
                      </button>
                    </p>
                  )}
                  {file && (
                    <div className="qb-staged-image">
                      <img
                        src={fileUrl || undefined}
                        alt="Ảnh đã chọn, chưa lưu"
                      />
                      <div>
                        <strong>{file.name}</strong>
                        <p id="image-status">
                          {replaceToken
                            ? "Sẽ thay ảnh hiện tại khi lưu."
                            : "Đã chọn · chờ lưu cùng câu hỏi."}
                        </p>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => {
                            setFile(null);
                            uploaded.current = undefined;
                            setReplaceToken("");
                            setMediaError("");
                          }}
                        >
                          Bỏ ảnh đã chọn
                        </button>
                      </div>
                    </div>
                  )}
                  {assets.length > 0 && (
                    <p className="qb-help">
                      Gỡ hoặc thay ảnh chỉ cập nhật câu hỏi này. Ảnh trong lịch
                      sử bài làm được giữ nguyên.
                    </p>
                  )}
                </div>
              </section>
            </fieldset>
          </div>
          <aside
            className="qb-preview"
            id="qb-preview-panel"
            aria-label="Bản xem trước câu hỏi"
          >
            <Preview value={d} />
            {file && (
              <div className="qb-pending-preview">
                <p>
                  Ảnh chờ lưu ·{" "}
                  {target === "promptMarkdown" ? "Nội dung" : "Lời giải"}
                </p>
                <img src={fileUrl || undefined} alt="Ảnh chờ lưu" />
              </div>
            )}
          </aside>
        </div>
      </form>
      <div className="qb-savebar">
        <div role="status" aria-live="polite">
          <span
            className={`qb-save-dot ${dirty ? "unsaved" : ""}`}
            aria-hidden="true"
          />
          {notice ||
            (readOnly
              ? "Chỉ xem"
              : dirty
                ? "Có thay đổi chưa lưu"
                : activeId.current
                  ? "Đã lưu tất cả thay đổi"
                  : "Câu hỏi mới · chưa lưu")}
        </div>
        <div className="qb-row-actions">
          <Link
            className="button secondary"
            to={`/teacher/question-banks/${bank.id}`}
          >
            {readOnly ? "Về ngân hàng" : "Hủy"}
          </Link>
          {!readOnly && (
            <button type="submit" form="question-form" disabled={busy}>
              {busy ? "Đang lưu…" : "Lưu câu hỏi"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
