import type { MindMap, MindMapNode, NodeId, NodeStyle } from "./mindmap";

export const MIN_IMAGE_SCALE = 0.25;
export const MAX_IMAGE_SCALE = 4;
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 200;

const INVALID_MESSAGES: Record<keyof NodeStyle, string> = {
  bold: "太字は真偽値で指定してください",
  italic: "斜体は真偽値で指定してください",
  color: "色は #RRGGBB の形式で指定してください",
  fontFamily: "フォント名が空です",
  fontSize: `文字サイズは ${MIN_FONT_SIZE} 以上 ${MAX_FONT_SIZE} 以下の数値で指定してください`,
};

const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export const isColor = (value: unknown): value is string =>
  typeof value === "string" && COLOR_PATTERN.test(value);

const isFontSize = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= MIN_FONT_SIZE &&
  value <= MAX_FONT_SIZE;

const isFontFamily = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

/** 各項目の検証。ファイルの読み込みと、操作での設定で、同じ規則を使う */
const VALIDATORS: Record<keyof NodeStyle, (value: unknown) => boolean> = {
  bold: (value) => typeof value === "boolean",
  italic: (value) => typeof value === "boolean",
  color: isColor,
  fontFamily: isFontFamily,
  fontSize: isFontSize,
};

/** 値が、有効な項目だけを持つスタイルか（未知の項目や不正な値は無効） */
export function isNodeStyle(value: unknown): value is NodeStyle {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, item]) =>
    Object.prototype.hasOwnProperty.call(VALIDATORS, key) ? VALIDATORS[key as keyof NodeStyle](item) : false,
  );
}

/** 設定する値を検証し、正規化した値を返す（undefined は解除を表す） */
function normalize<K extends keyof NodeStyle>(key: K, value: NodeStyle[K]): NodeStyle[K] {
  if (value === undefined) return value;
  if (!VALIDATORS[key](value)) {
    throw new Error(INVALID_MESSAGES[key]);
  }
  return (key === "fontFamily" ? (value as string).trim() : value) as NodeStyle[K];
}

/**
 * ノードのスタイルを部分的に設定する（値が undefined の項目は解除する）。
 * 変化がなければ同じマップを返し、スタイルが空になったら style 自体を取り除く。
 */
export function setNodeStyle(map: MindMap, nodeId: NodeId, patch: Partial<NodeStyle>): MindMap {
  const node = map.nodes[nodeId];
  if (!node) {
    throw new Error(`ノードが存在しません: ${nodeId}`);
  }

  const current = node.style ?? {};
  const next: Record<string, unknown> = { ...current };
  for (const key of Object.keys(patch) as (keyof NodeStyle)[]) {
    const value = normalize(key, patch[key]);
    if (value === undefined) delete next[key];
    else next[key] = value;
  }

  const keys = Object.keys(next);
  const unchanged =
    keys.length === Object.keys(current).length &&
    keys.every((key) => next[key] === (current as Record<string, unknown>)[key]);
  if (unchanged) return map;

  const updated: MindMapNode = { ...node, style: next as NodeStyle };
  if (keys.length === 0) delete updated.style;
  return { ...map, nodes: { ...map.nodes, [nodeId]: updated } };
}

/** 太字・斜体のオン／オフを切り替える（オフにするときは設定を解除する） */
export function toggleStyle(map: MindMap, nodeId: NodeId, key: "bold" | "italic"): MindMap {
  const enabled = map.nodes[nodeId]?.style?.[key];
  return setNodeStyle(map, nodeId, { [key]: enabled ? undefined : true });
}
