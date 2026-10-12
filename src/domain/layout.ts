import type { MindMap, MindMapNode, NodeId } from "./mindmap";

/** 階層ごとの、親ノードからの距離（px） */
export const LEVEL_DISTANCE = 180;

export interface LayoutOptions {
  levelDistance?: number;
}

/** 部分木に含まれる葉の数（扇形の大きさの重み） */
function countLeaves(map: MindMap, id: NodeId): number {
  const { childIds } = map.nodes[id];
  if (childIds.length === 0) return 1;
  return childIds.reduce((sum, childId) => sum + countLeaves(map, childId), 0);
}

/**
 * 扇形分割型の放射状レイアウトで、全ノードの位置を計算し直す。
 * ルートは原点、他のノードは扇形の中央の角度に「深さ × levelDistance」の距離で置く。
 * 扇形は左（-π）から時計回りに、葉の数に比例して子へ分配する。
 */
export function layout(map: MindMap, options: LayoutOptions = {}): MindMap {
  const levelDistance = options.levelDistance ?? LEVEL_DISTANCE;
  if (!(levelDistance > 0)) {
    throw new Error("levelDistance は正の数でなければなりません");
  }

  const nodes: Record<NodeId, MindMapNode> = {};

  const place = (id: NodeId, depth: number, start: number, end: number): void => {
    const node = map.nodes[id];
    const angle = (start + end) / 2;
    const radius = depth * levelDistance;
    const position =
      depth === 0
        ? { x: 0, y: 0 }
        : { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    nodes[id] = { ...node, position };

    const total = countLeaves(map, id);
    let cursor = start;
    for (const childId of node.childIds) {
      const span = ((end - start) * countLeaves(map, childId)) / total;
      place(childId, depth + 1, cursor, cursor + span);
      cursor += span;
    }
  };

  place(map.rootId, 0, -Math.PI, Math.PI);

  return { ...map, nodes };
}
