import type { MindMap, MindMapNode, NodeId } from "./mindmap";
import { labelBlock } from "./wrapLabel";
import { LABEL_CLEARANCE, centralEdgeDistance, iconWidth, nodeLabel, nodeTextStyle } from "./svgExport";

/** 階層ごとの、親ノードからの距離（px） */
export const LEVEL_DISTANCE = 180;

/** 中心ノードに画像（倍率 1）があるときに、ブランチを外側へずらす距離（px）。倍率に比例して変える */
export const CENTRAL_IMAGE_EXTRA = 80;

/** ラベルの前後に、枝の上で確保する余白の合計（px） */
const LABEL_PADDING = 40;

/** 子ブランチが、親ブランチの向きを中心に広がる、扇形の幅の上限（120°）。メインブランチが少ないときに、後ろへ回り込まないため */
const MAX_CHILD_FAN = (2 * Math.PI) / 3;

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
 * ラベルが、枝の上に入りきるために必要な、枝の長さ（余白を含む）。
 * 横書きのラベルの幅と高さを、枝の向き（角度）に投影した長さ。上下を向いた枝は、ほとんど長くならない。
 */
function labelLength(map: MindMap, node: MindMapNode, angle: number): number {
  const { fontSize } = nodeTextStyle(map, node);
  // 長いラベルは折り返すので、幅は上限まで、高さは行数の分になる
  const block = labelBlock(nodeLabel(node), fontSize);
  const width = block.width + (node.icon ? iconWidth(fontSize) : 0);
  return Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * block.height + LABEL_PADDING;
}

/**
 * 扇形分割型の放射状レイアウトで、全ノードの位置を計算し直す。
 * ルートは原点、他のノードは扇形の中央の角度に置く。親からの距離は、levelDistance か、
 * ラベルが入りきるのに必要な長さの、長い方（長いテキストでは、枝が長くなる）。
 * 扇形は、最初のメインブランチが右向き（角度0）の中心になる位置から時計回りに、葉の数に比例して子へ分配する。
 * 折りたたまれたノードは1枚の葉として扱い、その子孫は同じ位置に置く。
 */
export function layout(map: MindMap, options: LayoutOptions = {}): MindMap {
  const levelDistance = options.levelDistance ?? LEVEL_DISTANCE;
  if (!(levelDistance > 0)) {
    throw new Error("levelDistance は正の数でなければなりません");
  }

  const rootNode = map.nodes[map.rootId];
  const imageExtra = rootNode.image ? CENTRAL_IMAGE_EXTRA * (rootNode.style?.imageScale ?? 1) : 0;
  const nodes: Record<NodeId, MindMapNode> = {};

  /** ノードの、中心からの距離 */
  const radiusOf = (node: MindMapNode, depth: number, parentRadius: number, angle: number) => {
    if (depth === 0) return 0;
    const needed = labelLength(map, node, angle);
    if (depth === 1) {
      // メインブランチ: 中心ノード（画像）の外側に、ラベルが入る長さを取る。
      // 画像があるときは、画像と重ならないよう、すべてのブランチを外側へずらす
      const edge = centralEdgeDistance(rootNode, Math.cos(angle), Math.sin(angle)) + LABEL_CLEARANCE;
      return Math.max(levelDistance + imageExtra, edge + needed);
    }
    return parentRadius + Math.max(levelDistance, needed);
  };

  const place = (
    id: NodeId,
    depth: number,
    parentRadius: number,
    start: number,
    end: number,
  ): void => {
    const node = map.nodes[id];
    const angle = (start + end) / 2;
    const radius = radiusOf(node, depth, parentRadius, angle);
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

    // 中心の子（メインブランチ）以外は、親の向きを中心に、上限の幅までの扇形に子を並べる
    const fan = depth === 0 ? end - start : Math.min(end - start, MAX_CHILD_FAN);
    const total = countLeaves(map, id);
    let cursor = angle - fan / 2;
    for (const childId of node.childIds) {
      const span = (fan * countLeaves(map, childId)) / total;
      place(childId, depth + 1, radius, cursor, cursor + span);
      cursor += span;
    }
  };

  // 最初のメインブランチの扇形が、右向き（角度0）を中心にするよう、開始角をずらす
  const [firstChildId] = map.nodes[map.rootId].childIds;
  const start =
    firstChildId === undefined
      ? -Math.PI
      : (-Math.PI * countLeaves(map, firstChildId)) / countLeaves(map, map.rootId);
  place(map.rootId, 0, 0, start, start + 2 * Math.PI);

  return { ...map, nodes };
}
