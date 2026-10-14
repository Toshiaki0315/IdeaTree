import type { MindMap, MindMapNode, NodeId } from "./mindmap";

/** メモの長さの上限（文字数）。JSON に埋め込むので、大きくしすぎない */
export const MAX_NOTE_LENGTH = 10000;
/** リンク（URL）の長さの上限（文字数） */
export const MAX_LINK_LENGTH = 2048;

const LINK_SCHEME_ERROR = "リンクは、http か https の URL にしてください";

/** http・https の URL として読めるか（スキームが http か https で、ホスト名がある） */
function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "" ? url : null;
  } catch {
    return null;
  }
}

/** 値が、メモとして保存できる文字列か（上限以内） */
export function isNote(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_NOTE_LENGTH;
}

/** 値が、リンクとして保存できる URL か（http・https で、上限以内） */
export function isLink(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_LINK_LENGTH && parseHttpUrl(value) !== null;
}

/**
 * 入力されたリンクを、保存する形（URL）にする。前後の空白は取り除き、スキームがなければ https:// を補う。
 * 空なら、リンクなし（undefined）。http・https 以外（javascript: や file: など）や、読めない URL は、エラーにする。
 */
export function normalizeLink(input: string): string | undefined {
  const trimmed = input.trim();
  if (trimmed === "") return undefined;

  // http(s):// 以外のスキーム（javascript: など）は、補完せずに、拒否する。
  // 「example.com:8080」のような、ポート番号つきのホストは、スキームではない
  const otherScheme =
    /^(?:[a-z][a-z0-9+.-]*:\/\/|(?:javascript|data|vbscript|file|mailto|tel|blob|about):)/i.test(trimmed);
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : otherScheme ? trimmed : `https://${trimmed}`;
  const url = parseHttpUrl(candidate);
  if (url === null) throw new Error(LINK_SCHEME_ERROR);
  if (url.href.length > MAX_LINK_LENGTH)
    throw new Error(`リンクが長すぎます（上限 ${MAX_LINK_LENGTH} 文字）`);
  return url.href;
}

/** 入力中のリンクの検証。有効か、空なら null。そうでなければ、エラーの理由 */
export function linkError(input: string): string | null {
  try {
    normalizeLink(input);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

/** ノードを書き換えた新しいマップを返す。値が undefined なら、その項目を外す */
function withField<K extends "note" | "link">(
  map: MindMap,
  nodeId: NodeId,
  key: K,
  value: MindMapNode[K],
): MindMap {
  const node = map.nodes[nodeId];
  if (node[key] === value) return map;
  const updated: MindMapNode = { ...node, [key]: value };
  if (value === undefined) delete updated[key];
  return { ...map, nodes: { ...map.nodes, [nodeId]: updated } };
}

function requireNode(map: MindMap, nodeId: NodeId): void {
  if (!map.nodes[nodeId]) {
    throw new Error(`ノードが存在しません: ${nodeId}`);
  }
}

/**
 * ノードのメモを設定する（undefined か、空白だけで、外す）。前後の空白は取り除く。
 * 元のマップは変更しない。変化がなければ、同じマップを返す。
 */
export function setNodeNote(map: MindMap, nodeId: NodeId, note: string | undefined): MindMap {
  requireNode(map, nodeId);
  const trimmed = note?.trim();
  if (trimmed !== undefined && trimmed.length > MAX_NOTE_LENGTH) {
    throw new Error(`メモが長すぎます（上限 ${MAX_NOTE_LENGTH} 文字）`);
  }
  return withField(map, nodeId, "note", trimmed === "" ? undefined : trimmed);
}

/**
 * ノードのリンクを設定する（undefined で外す）。リンクは、http・https の URL（normalizeLink を通したもの）。
 * 元のマップは変更しない。変化がなければ、同じマップを返す。
 */
export function setNodeLink(map: MindMap, nodeId: NodeId, link: string | undefined): MindMap {
  requireNode(map, nodeId);
  if (link !== undefined && !isLink(link)) throw new Error(LINK_SCHEME_ERROR);
  return withField(map, nodeId, "link", link);
}
