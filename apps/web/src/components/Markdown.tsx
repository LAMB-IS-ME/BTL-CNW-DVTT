import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css";
export function QuestionImage(props: { src?: string; alt?: string }) {
  // A different source must not inherit a previous image's error/load state.
  return <AssetImage key={props.src} {...props} />;
}
function AssetImage({ src, alt }: { src?: string; alt?: string }) {
  const asset = src?.startsWith("asset:") ? src.slice(6) : null;
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const q = useQuery({
    queryKey: ["asset", asset],
    queryFn: () => api<{ url: string }>(`/assets/${asset}`),
    enabled: !!asset,
    staleTime: 240000,
    retry: false,
  });
  const label = alt || "Hình minh họa câu hỏi";
  const failed =
    !refreshing && (state === "error" || (!!asset && q.isError) || !src);
  const url = asset ? q.data?.url : src;
  async function retry() {
    if (refreshing) return;
    setRefreshing(true);
    // Renew asset authorization/signature as well as retrying the image request.
    // Never append cache-busting parameters to a signed URL.
    try {
      if (asset) await q.refetch();
    } catch {
      // The query error below retains the retry action after a failed renewal.
    } finally {
      setAttempt((n) => n + 1);
      setState("loading");
      setRefreshing(false);
    }
  }
  return (
    <span
      className="question-image"
      aria-busy={!failed && (refreshing || state !== "loaded")}
    >
      {failed ? (
        <span role="alert">
          Không thể tải ảnh: {label}.{" "}
          {/* Remains usable inside read-only/disabled Builder and answer fieldsets. */}
          <a
            href="#"
            role="button"
            aria-label={`Thử tải lại ảnh: ${label}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void retry();
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === " ") {
                event.preventDefault();
                event.currentTarget.click();
              }
            }}
          >
            Thử tải lại ảnh
          </a>
        </span>
      ) : (
        <>
          {!refreshing && url && (
            <img
              key={attempt}
              src={url}
              alt={label}
              loading="lazy"
              onLoad={() => setState("loaded")}
              onError={() => setState("error")}
            />
          )}
          {(refreshing || state === "loading") && (
            <span role="status">Đang tải ảnh: {label}…</span>
          )}
        </>
      )}
    </span>
  );
}
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        urlTransform={(url) =>
          /^asset:[\da-f-]{36}$/.test(url) ? url : defaultUrlTransform(url)
        }
        components={{
          img: QuestionImage,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
