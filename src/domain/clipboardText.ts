import type { Subtree } from "./copyNode";
import { deserialize } from "./deserialize";
import { SAVE_FORMAT_VERSION } from "./serialize";

/** クリップボードの文字列が、IdeaTree のサブツリーであることを示す印 */
const SUBTREE_TYPE = "ideatree-subtree";

/** 貼り付けられる行数の上限（巨大なテキストで、ノードが大量にできないようにする） */
export const MAX_PASTE_LINES = 200;

export type ClipboardContent =
  | { kind: "subtree"; subtree: Subtree }
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

/** JSON として読めて、サブツリーの印があれば、検証して返す。壊れていれば null */
function parseSubtree(text: string): Subtree | null {
  try {
    if (JSON.parse(text).type !== SUBTREE_TYPE) return null;
    return deserialize(text, { subtree: true });
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
    const subtree = parseSubtree(trimmed);
    return subtree ? { kind: "subtree", subtree } : { kind: "none" };
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (lines.length === 0 || lines.length > MAX_PASTE_LINES) return { kind: "none" };
  return { kind: "lines", lines };
}
