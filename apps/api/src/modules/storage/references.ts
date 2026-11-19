import type { Prisma } from "../../generated/prisma/client.js";
import { check } from "../../utils/errors.js";
type Content = {
  promptMarkdown: string;
  explanationMarkdown?: string | null;
  options: { contentMarkdown: string }[];
};
export function assetIds(content: Content) {
  return [
    ...new Set(
      [
        content.promptMarkdown,
        content.explanationMarkdown || "",
        ...content.options.map((o) => o.contentMarkdown),
      ].flatMap((text) =>
        Array.from(
          text.matchAll(/asset:([\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12})/gi),
          (match) => match[1]!.toLowerCase(),
        ),
      ),
    ),
  ];
}
// Call only while holding the owner's catalog lock. Assets belong to their
// question; Student signing uses that same question identity in snapshots.
export async function validateAssets(
  tx: Prisma.TransactionClient,
  content: Content,
  questionId?: string,
) {
  return validateSourceAssets(tx, [{ ...content, id: questionId }]);
}
export async function validateSourceAssets(
  tx: Prisma.TransactionClient,
  sources: (Content & { id?: string })[],
) {
  const references = sources.flatMap((q) =>
    assetIds(q).map((id) => ({ id, questionId: q.id })),
  );
  if (!references.length) return;
  const assets = await tx.questionAsset.findMany({
    where: { id: { in: [...new Set(references.map((r) => r.id))] } },
    select: { id: true, questionId: true },
  });
  const owners = new Map(assets.map((a) => [a.id, a.questionId]));
  check(
    references.every((r) => r.questionId && owners.get(r.id) === r.questionId),
    400,
    "INVALID_ASSET_REFERENCE",
    "Ảnh không còn tồn tại hoặc không thuộc câu hỏi này. Hãy tải ảnh lên câu hỏi rồi lưu lại.",
  );
}
