import { getBranchColor } from "./branchColor";
import { fmt } from "./format";
import type { MindMap, MindMapNode, NodeId } from "./mindmap";
import { labelBlock } from "./wrapLabel";

/** ノードの見た目・位置の計算（SVG の文字列や、画面の描画に共通で使う） */

export const FONT_FAMILY = "'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Yu Gothic', sans-serif";
const BASE_STROKE_WIDTH = 12;
const STROKE_DECAY = 0.6;

/** 深さが増えるほど細くなる線幅 */
export function strokeWidthAt(depth: number): number {
  return BASE_STROKE_WIDTH * STROKE_DECAY ** (depth - 1);
}
export const CENTRAL_RX = 70;
export const CENTRAL_RY = 40;
export const CENTRAL_STROKE = "#333333";
export const BACKGROUND = "#FFFFFF";
export const LABEL_HALO_WIDTH = 5;

/** 表示するラベル。子を隠している（折りたたまれた）ノードには末尾に「…」を付ける */
export function nodeLabel(node: MindMapNode): string {
  return node.collapsed && node.childIds.length > 0 ? `${node.text}…` : node.text;
}

/** 中心ノードの画像（セントラルイメージ）を収める枠の大きさ */
export const CENTRAL_IMAGE = { width: 160, height: 120 };
/** メインブランチなどの画像を収める枠の大きさ */
export const BRANCH_IMAGE = { width: 64, height: 48 };

/** ラベルの中心から、画像の枠の下端までの距離（画像はラベルの上に置く） */
const BRANCH_IMAGE_GAP = 12;
/** 中心ノードの画像の下端から、テキストの中心までの距離 */
const CENTRAL_LABEL_GAP = 20;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 中心ノードの端から、メインブランチのラベルまでの余白 */
export const LABEL_CLEARANCE = 10;

/** 中心ノードの中心から、指定した向き（単位ベクトル）にある、中心ノードの端までの距離 */
export function centralEdgeDistance(root: MindMapNode, ux: number, uy: number): number {
  if (root.image) {
    // 画像があるときは、画像の枠（長方形）の端
    const scale = imageScaleOf(root);
    const halfW = (CENTRAL_IMAGE.width * scale) / 2;
    const halfH = (CENTRAL_IMAGE.height * scale) / 2;
    return Math.min(halfW / Math.abs(ux), halfH / Math.abs(uy));
  }
  // 楕円の端
  return (CENTRAL_RX * CENTRAL_RY) / Math.hypot(CENTRAL_RY * ux, CENTRAL_RX * uy);
}

/**
 * ブランチのラベルを置く位置。中心ノード以外に使う。
 * サブブランチは、親と子を結ぶ枝の中点。メインブランチは、中心ノードと重ならないよう、
 * 中心ノードの外側に出ている枝の部分の真ん中。
 */
export function labelPosition(map: MindMap, node: MindMapNode): { x: number; y: number } {
  const parent = map.nodes[node.parentId as NodeId];
  const midpoint = {
    x: (parent.position.x + node.position.x) / 2,
    y: (parent.position.y + node.position.y) / 2,
  };
  if (parent.parentId !== null) return midpoint;

  const dx = node.position.x - parent.position.x;
  const dy = node.position.y - parent.position.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return midpoint;
  const start = centralEdgeDistance(parent, dx / distance, dy / distance) + LABEL_CLEARANCE;
  if (distance <= start) return midpoint;

  const middle = (start + distance) / 2;
  return {
    x: parent.position.x + (dx / distance) * middle,
    y: parent.position.y + (dy / distance) * middle,
  };
}

/** ノードの画像の倍率（指定がなければ 1） */
export function imageScaleOf(node: MindMapNode): number {
  return node.style?.imageScale ?? 1;
}

/** ノードの画像を描く枠（倍率を反映する）。中心ノードは、位置の中心。それ以外は、ラベルの上 */
export function imageBox(map: MindMap, node: MindMapNode): Box {
  const scale = imageScaleOf(node);
  if (node.parentId === null) {
    const width = CENTRAL_IMAGE.width * scale;
    const height = CENTRAL_IMAGE.height * scale;
    return { x: node.position.x - width / 2, y: node.position.y - height / 2, width, height };
  }
  const { x, y } = labelPosition(map, node);
  const width = BRANCH_IMAGE.width * scale;
  const height = BRANCH_IMAGE.height * scale;
  return { x: x - width / 2, y: y - BRANCH_IMAGE_GAP - height, width, height };
}

/** 中心ノードの画像があるときの、テキストの位置（画像の下）。なければ、ノードの位置 */
export function centralLabelY(node: MindMapNode): number {
  return node.image
    ? node.position.y + (CENTRAL_IMAGE.height * imageScaleOf(node)) / 2 + CENTRAL_LABEL_GAP
    : node.position.y;
}

const ICON_GAP = 6;
const ICON_SCALE = 1.1;
/** 中心ノードのアイコンの下端から、楕円（画像）の上端までの距離 */
const ROOT_ICON_GAP = 4;

/** アイコンが、ラベルの横に占める幅（アイコンの大きさと、ラベルとの間の余白） */
export function iconWidth(labelFontSize: number): number {
  return labelFontSize * ICON_SCALE + ICON_GAP;
}

/** アイコン（24×24 の絵）を置く、正方形の枠。x, y は左上、size は1辺の長さ */
export interface IconPlacement {
  x: number;
  y: number;
  size: number;
}

/** アイコンの位置。ブランチは、ラベルの左側。中心ノードは、楕円（画像）の上に、中央揃え */
export function iconPlacement(map: MindMap, node: MindMapNode): IconPlacement {
  const look = nodeTextStyle(map, node);
  const size = look.fontSize * ICON_SCALE;
  if (node.parentId === null) {
    const top = node.image
      ? node.position.y - (CENTRAL_IMAGE.height * imageScaleOf(node)) / 2
      : node.position.y - CENTRAL_RY;
    return { x: node.position.x - size / 2, y: top - ROOT_ICON_GAP - size, size };
  }
  const { x, y } = labelPosition(map, node);
  const labelWidth = labelBlock(nodeLabel(node), look.fontSize).width;
  return { x: x - labelWidth / 2 - ICON_GAP - size, y: y - size / 2, size };
}

/** アイコンの 24×24 の絵を、枠に収める変換（SVG の transform 属性） */
export function iconTransform(place: IconPlacement): string {
  // 倍率は、小数第2位では粗いので、小数第4位まで出す
  return `translate(${fmt(place.x)} ${fmt(place.y)}) scale(${Number((place.size / 24).toFixed(4))})`;
}

/** テキストと枝の見た目（スタイルの指定があればそれを、なければ既定値を使う） */
export interface NodeTextStyle {
  color: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: "bold" | "normal";
  fontStyle: "italic" | "normal";
}

const DEFAULT_FONT_SIZES = { central: 24, main: 20, sub: 16 };

export function nodeTextStyle(map: MindMap, node: MindMapNode): NodeTextStyle {
  const style = node.style ?? {};
  const isRoot = node.parentId === null;
  const defaultSize = isRoot
    ? DEFAULT_FONT_SIZES.central
    : depthOf(map, node) === 1
      ? DEFAULT_FONT_SIZES.main
      : DEFAULT_FONT_SIZES.sub;
  // CSS の font-family を壊さないよう、引用符とバックスラッシュは取り除く
  const family = style.fontFamily?.replace(/['"\\]/g, "");

  return {
    color: style.color ?? (isRoot ? CENTRAL_STROKE : (getBranchColor(map, node.id) as string)),
    fontFamily: family ? `'${family}', ${FONT_FAMILY}` : FONT_FAMILY,
    fontSize: style.fontSize ?? defaultSize,
    fontWeight: style.bold ? "bold" : "normal",
    fontStyle: style.italic ? "italic" : "normal",
  };
}

export function depthOf(map: MindMap, node: MindMapNode): number {
  let depth = 0;
  for (let n = node; n.parentId !== null; n = map.nodes[n.parentId]) depth++;
  return depth;
}

/** 親から子へ、緩やかなS字を描く三次ベジェ曲線のパス */
export function branchPath(from: MindMapNode, to: MindMapNode): string {
  const dx = to.position.x - from.position.x;
  const dy = to.position.y - from.position.y;
  // 進行方向に直交する単位ベクトル × 長さの一部 = 曲がりの大きさ
  const bend = 0.18;
  const nx = -dy * bend;
  const ny = dx * bend;
  const c1 = [from.position.x + dx * 0.35 + nx, from.position.y + dy * 0.35 + ny];
  const c2 = [from.position.x + dx * 0.65 - nx, from.position.y + dy * 0.65 - ny];
  const points = [c1, c2, [to.position.x, to.position.y]].map(([x, y]) => `${fmt(x)} ${fmt(y)}`);
  return `M${fmt(from.position.x)} ${fmt(from.position.y)} C${points.join(", ")}`;
}
