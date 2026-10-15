import type { Subtree } from "./copyNode";
import { deserialize } from "./deserialize";
import { SAVE_FORMAT_VERSION } from "./serialize";

/** クリップボードの文字列が、IdeaTree のサブツリーであることを示す印 */
const SUBTREE_TYPE = "ideatree-subtree";
/** 複数のサブツリーであることを示す印 */
const SUBTREES_TYPE = "ideatree-subtrees";

/** 貼り付けられる行数の上限（巨大なテキストで、ノードが大量にできないようにする） */
export const MAX_PASTE_LINES = 200;

export type ClipboardContent =
  | { kind: "subtree"; subtree: Subtree }
  | { kind: "subtrees"; subtrees: Subtree[] }
  | { kind: "lines"; lines: string[] }
  | { kind: "none" };

/** コピーしたサブツリーを、クリップボードに入れる文字列（JSON）にする */
export function subtreeToText(subtree: Subtree): string {
  return JSON.stringify({
    type: SUBTREE_TYPE,
    version: SAVE_FORMAT_VERSION,
    rootId: subtree.rootId,
    nodes: subtree.nodes,
  });
}

/**
 * コピーした複数のサブツリーを、クリップボードに入れる文字列（JSON）にする。
 * 1つだけなら、subtreeToText と同じ形式（従来のバージョンでも、貼り付けられる）。
 */
export function subtreesToText(subtrees: readonly Subtree[]): string {
  if (subtrees.length === 1) return subtreeToText(subtrees[0]);
  return JSON.stringify({
    type: SUBTREES_TYPE,
    version: SAVE_FORMAT_VERSION,
    subtrees: subtrees.map(({ rootId, nodes }) => ({ rootId, nodes })),
  });
}

/** JSON として読めて、サブツリー（1つ・複数）の印があれば、検証して返す。壊れていれば null */
function parseSubtrees(text: string): Subtree[] | null {
  try {
    const data = JSON.parse(text);
    if (data.type === SUBTREE_TYPE) return [deserialize(text, { subtree: true })];
    if (data.type !== SUBTREES_TYPE) return null;
    const { subtrees, version } = data;
    if (!Array.isArray(subtrees) || subtrees.length === 0 || subtrees.length > MAX_PASTE_LINES) return null;
    return subtrees.map((item) =>
      deserialize(JSON.stringify({ version, rootId: item.rootId, nodes: item.nodes }), { subtree: true }),
    );
  } catch {
    return null;
  }
}

/**
 * クリップボードの文字列を解釈する。
 * IdeaTree のサブツリー、普通のテキスト（行ごとに1ノード）、貼り付けられないもの、のいずれか。
 */
export function parseClipboardText(text: string): ClipboardContent {
  const trimmed = text.trim();

  // JSON のように見えるものは、IdeaTree のサブツリー以外は貼り付けない（文字の羅列になるため）
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const subtrees = parseSubtrees(trimmed);
    if (subtrees === null) return { kind: "none" };
    return subtrees.length === 1 ? { kind: "subtree", subtree: subtrees[0] } : { kind: "subtrees", subtrees };
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (lines.length === 0 || lines.length > MAX_PASTE_LINES) return { kind: "none" };
  return { kind: "lines", lines };
}
