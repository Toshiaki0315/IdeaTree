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

export function nodeTextStyle(
  map: MindMap,
  node: MindMapNode,
  /** 中心ノードの文字の色（指定がないとき）。テーマによって変わる */
  centralColor: string = CENTRAL_STROKE,
): NodeTextStyle {
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
    color: style.color ?? (isRoot ? centralColor : (getBranchColor(map, node.id) as string)),
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

/** 枝の図形の輪郭の太さ（塗りと同じ色。角を丸め、細い先でも、途切れて見えないようにする） */
export const BRANCH_OUTLINE_WIDTH = 1;
/** 先の太さの下限（とても深い枝でも、これより細くしない） */
export const MIN_TIP_WIDTH = 2;
/** 先の太さは、根元の何倍か */
const TIP_RATIO = 0.4;
/** 枝の曲線を、いくつの点で近似するか */
const TAPER_STEPS = 24;

/** 枝の太さ。根元は、深さごとの線幅で、先に向かって細くなる（Buzan のマインドマップのように） */
export function branchWidths(depth: number): { start: number; end: number } {
  const start = strokeWidthAt(depth);
  return { start, end: Math.max(MIN_TIP_WIDTH, start * TIP_RATIO) };
}

/**
 * 親から子へ、緩やかなS字を描く枝の、先細りの図形（閉じたパス。塗りつぶして使う）。
 * 中心の線は三次ベジェ曲線で、根元の幅 start から、先の幅 end へ、なめらかに細くなる。
 */
export function taperedBranchPath(from: MindMapNode, to: MindMapNode, start: number, end: number): string {
  const x0 = from.position.x;
  const y0 = from.position.y;
  const dx = to.position.x - x0;
  const dy = to.position.y - y0;
  // 進行方向に直交する単位ベクトル × 長さの一部 = 曲がりの大きさ
  const bend = 0.18;
  const nx = -dy * bend;
  const ny = dx * bend;
  const x1 = x0 + dx * 0.35 + nx;
  const y1 = y0 + dy * 0.35 + ny;
  const x2 = x0 + dx * 0.65 - nx;
  const y2 = y0 + dy * 0.65 - ny;
  const x3 = to.position.x;
  const y3 = to.position.y;

  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i <= TAPER_STEPS; i++) {
    const t = i / TAPER_STEPS;
    const u = 1 - t;
    // 三次ベジェ曲線の位置と、接線（微分）
    const x = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
    const y = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
    const tx = 3 * u * u * (x1 - x0) + 6 * u * t * (x2 - x1) + 3 * t * t * (x3 - x2);
    const ty = 3 * u * u * (y1 - y0) + 6 * u * t * (y2 - y1) + 3 * t * t * (y3 - y2);
    const length = Math.hypot(tx, ty);
    // 位置が重なっているとき（長さ 0）は、向きが決まらないので、横向きとみなす
    const ux = length === 0 ? 1 : tx / length;
    const uy = length === 0 ? 0 : ty / length;
    const half = (start + (end - start) * t) / 2;
    left.push(`${fmt(x - uy * half)} ${fmt(y + ux * half)}`);
    right.push(`${fmt(x + uy * half)} ${fmt(y - ux * half)}`);
  }
  return `M${left[0]} L${[...left.slice(1), ...right.reverse()].join(" L")} Z`;
}

/** 関連線の色・太さ・破線の間隔 */
export const RELATION_STYLE = { color: "#8B949E", width: 2, dash: "6 4" } as const;

/** 関連線の端を、ノードの位置から離す距離（ノードの印に、重ならないように） */
const RELATION_GAP = 10;
/** 関連線の曲がりの大きさ（2つのノードの距離に対する割合） */
const RELATION_BEND = 0.25;
const ARROW_LENGTH = 11;
const ARROW_WIDTH = 8;

/**
 * 関連線（2つのノードを結ぶ、曲がった矢印）の形。line は曲線（二次ベジェ）、arrow は向かう先の矢じり（塗りつぶす三角形）。
 * from から to へ向かう。
 */
export function relationGeometry(from: MindMapNode, to: MindMapNode): { line: string; arrow: string } {
  const dx = to.position.x - from.position.x;
  const dy = to.position.y - from.position.y;
  const distance = Math.hypot(dx, dy);
  // 位置が重なっているときは、向きが決まらないので、横向きとみなす
  const ux = distance === 0 ? 1 : dx / distance;
  const uy = distance === 0 ? 0 : dy / distance;

  const sx = from.position.x + ux * RELATION_GAP;
  const sy = from.position.y + uy * RELATION_GAP;
  const ex = to.position.x - ux * RELATION_GAP;
  const ey = to.position.y - uy * RELATION_GAP;
  const cx = (sx + ex) / 2 - uy * distance * RELATION_BEND;
  const cy = (sy + ey) / 2 + ux * distance * RELATION_BEND;

  // 矢じりは、終点での、曲線の向き（制御点から終点）に合わせる（制御点は、終点と重ならない）
  const tLength = Math.hypot(ex - cx, ey - cy);
  const vx = (ex - cx) / tLength;
  const vy = (ey - cy) / tLength;
  const bx = ex - vx * ARROW_LENGTH;
  const by = ey - vy * ARROW_LENGTH;
  const half = ARROW_WIDTH / 2;

  return {
    line: `M${fmt(sx)} ${fmt(sy)} Q${fmt(cx)} ${fmt(cy)} ${fmt(ex)} ${fmt(ey)}`,
    arrow: `M${fmt(ex)} ${fmt(ey)} L${fmt(bx - vy * half)} ${fmt(by + vx * half)} L${fmt(bx + vy * half)} ${fmt(by - vx * half)} Z`,
  };
}
