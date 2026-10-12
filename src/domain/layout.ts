import type { MindMap, MindMapNode, NodeId } from "./mindmap";

/** 階層ごとの、親ノードからの距離（px） */
export const LEVEL_DISTANCE = 180;

/** 中心ノードに画像があるときに、ブランチを外側へずらす距離（px） */
export const CENTRAL_IMAGE_EXTRA = 80;

export interface LayoutOptions {
  levelDistance?: number;
}

/** 部分木に含まれる葉の数（扇形の大きさの重み）。折りたたまれたノードは1枚の葉として数える */
function countLeaves(map: MindMap, id: NodeId): number {
  const { childIds, collapsed } = map.nodes[id];
  if (childIds.length === 0 || collapsed) return 1;
  return childIds.reduce((sum, childId) => sum + countLeaves(map, childId), 0);
}

/**
 * 扇形分割型の放射状レイアウトで、全ノードの位置を計算し直す。
 * ルートは原点、他のノードは扇形の中央の角度に「深さ × levelDistance」の距離で置く。
 * 扇形は、最初のメインブランチが右向き（角度0）の中心になる位置から時計回りに、葉の数に比例して子へ分配する。
 * 折りたたまれたノードは1枚の葉として扱い、その子孫は同じ位置に置く。
 */
export function layout(map: MindMap, options: LayoutOptions = {}): MindMap {
  const levelDistance = options.levelDistance ?? LEVEL_DISTANCE;
  if (!(levelDistance > 0)) {
    throw new Error("levelDistance は正の数でなければなりません");
  }

  const imageExtra = map.nodes[map.rootId].image ? CENTRAL_IMAGE_EXTRA : 0;
  const nodes: Record<NodeId, MindMapNode> = {};

  const place = (id: NodeId, depth: number, start: number, end: number): void => {
    const node = map.nodes[id];
    const angle = (start + end) / 2;
    // 中心ノードに画像があるときは、画像と重ならないよう、すべてのブランチを外側へずらす
    const radius = depth === 0 ? 0 : depth * levelDistance + imageExtra;
    const position =
      depth === 0
        ? { x: 0, y: 0 }
        : { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    nodes[id] = { ...node, position };

    if (node.collapsed) {
      // 折りたたまれた子孫は表示されないので、このノードと同じ位置に置く
      const hide = (childIds: NodeId[]) =>
        childIds.forEach((childId) => {
          nodes[childId] = { ...map.nodes[childId], position };
          hide(map.nodes[childId].childIds);
        });
      hide(node.childIds);
      return;
    }

    const total = countLeaves(map, id);
    let cursor = start;
    for (const childId of node.childIds) {
      const span = ((end - start) * countLeaves(map, childId)) / total;
      place(childId, depth + 1, cursor, cursor + span);
      cursor += span;
    }
  };

  // 最初のメインブランチの扇形が、右向き（角度0）を中心にするよう、開始角をずらす
  const [firstChildId] = map.nodes[map.rootId].childIds;
  const start =
    firstChildId === undefined
      ? -Math.PI
      : (-Math.PI * countLeaves(map, firstChildId)) / countLeaves(map, map.rootId);
  place(map.rootId, 0, start, start + 2 * Math.PI);

  return { ...map, nodes };
}
