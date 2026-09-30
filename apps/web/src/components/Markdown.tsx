import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css";
function AssetImage({ src, alt }: { src?: string; alt?: string }) {
  const asset = src?.startsWith("asset:") ? src.slice(6) : null;
  const q = useQuery({
    queryKey: ["asset", asset],
    queryFn: () => api<{ url: string }>(`/assets/${asset}`),
    enabled: !!asset,
    staleTime: 240000,
  });
  return (
    <img
      src={asset ? q.data?.url : src}
      alt={alt || "Hình minh họa câu hỏi"}
      loading="lazy"
    />
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
          img: ({ src, alt }) => <AssetImage src={src} alt={alt} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
