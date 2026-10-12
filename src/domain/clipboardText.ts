import type { Subtree } from "./copyNode";

/** 貼り付けられる行数の上限（巨大なテキストで、ノードが大量にできないようにする） */
export const MAX_PASTE_LINES = 200;

export type ClipboardContent =
  | { kind: "subtree"; subtree: Subtree }
  | { kind: "lines"; lines: string[] }
  | { kind: "none" };

export function subtreeToText(_subtree: Subtree): string {
  throw new Error("未実装");
}

export function parseClipboardText(_text: string): ClipboardContent {
  throw new Error("未実装");
}
