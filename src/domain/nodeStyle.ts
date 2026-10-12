import type { MindMap, MindMapNode, NodeId, NodeStyle } from "./mindmap";

export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 200;

const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/** 設定する値を検証し、正規化した値を返す（undefined は解除を表す） */
function normalize<K extends keyof NodeStyle>(key: K, value: NodeStyle[K]): NodeStyle[K] {
  if (key === "color" && value !== undefined && !COLOR_PATTERN.test(value as string)) {
    throw new Error("色は #RRGGBB の形式で指定してください");
  }
  if (key === "fontSize" && value !== undefined) {
    const size = value as number;
    if (!Number.isFinite(size) || size < MIN_FONT_SIZE || size > MAX_FONT_SIZE) {
      throw new Error(
        `文字サイズは ${MIN_FONT_SIZE} 以上 ${MAX_FONT_SIZE} 以下の数値で指定してください`,
      );
    }
  }
  if (key === "fontFamily" && value !== undefined) {
    const family = (value as string).trim();
    if (family === "") throw new Error("フォント名が空です");
    return family as NodeStyle[K];
  }
  return value;
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
