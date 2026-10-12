import { getBranchColor } from "./branchColor";
import type { MindMap, MindMapNode, NodeId } from "./mindmap";

const FONT_FAMILY = "'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Yu Gothic', sans-serif";
const MARGIN = 120;
const BASE_STROKE_WIDTH = 12;
const STROKE_DECAY = 0.6;
const CENTRAL_RX = 70;
const CENTRAL_RY = 40;
const CENTRAL_STROKE = "#333333";
const BACKGROUND = "#FFFFFF";
const LABEL_HALO_WIDTH = 5;

/** 小数第2位に丸め、-0 や指数表記を避けた数値文字列にする */
function fmt(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function depthOf(map: MindMap, node: MindMapNode): number {
  let depth = 0;
  for (let n = node; n.parentId !== null; n = map.nodes[n.parentId]) depth++;
  return depth;
}

/** 親から子へ、緩やかなS字を描く三次ベジェ曲線のパス */
function branchPath(from: MindMapNode, to: MindMapNode): string {
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

/** レイアウト済みのマインドマップを、SVG文書（文字列）に変換する */
export function exportSvg(map: MindMap): string {
  const nodes = Object.values(map.nodes);
  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  const minX = Math.min(...xs) - MARGIN;
  const minY = Math.min(...ys) - MARGIN;
  const width = Math.max(...xs) + MARGIN - minX;
  const height = Math.max(...ys) + MARGIN - minY;

  const branches: string[] = [];
  const shapes: string[] = [];
  const labels: string[] = [];

  for (const node of nodes) {
    const id: NodeId = escapeXml(node.id);
    const depth = depthOf(map, node);
    const { x, y } = node.position;

    if (node.parentId === null) {
      shapes.push(
        `<ellipse data-node-id="${id}" cx="${fmt(x)}" cy="${fmt(y)}" rx="${CENTRAL_RX}" ry="${CENTRAL_RY}" fill="${BACKGROUND}" stroke="${CENTRAL_STROKE}" stroke-width="4"/>`,
      );
      labels.push(
        `<text data-node-id="${id}" x="${fmt(x)}" y="${fmt(y)}" text-anchor="middle" dominant-baseline="central" font-family="${escapeXml(FONT_FAMILY)}" font-size="24" font-weight="bold" fill="${CENTRAL_STROKE}">${escapeXml(node.text)}</text>`,
      );
      continue;
    }

    const color = getBranchColor(map, node.id) as string;
    const strokeWidth = BASE_STROKE_WIDTH * STROKE_DECAY ** (depth - 1);
    branches.push(
      `<path data-node-id="${id}" d="${branchPath(map.nodes[node.parentId], node)}" fill="none" stroke="${color}" stroke-width="${fmt(strokeWidth)}" stroke-linecap="round"/>`,
    );
    // ブランチのテキストは枝の中点に置く（枝の先で子ブランチと重ならない）
    const parent = map.nodes[node.parentId];
    const labelX = (parent.position.x + x) / 2;
    const labelY = (parent.position.y + y) / 2;
    labels.push(
      `<text data-node-id="${id}" x="${fmt(labelX)}" y="${fmt(labelY)}" text-anchor="middle" dominant-baseline="central" font-family="${escapeXml(FONT_FAMILY)}" font-size="${depth === 1 ? 20 : 16}" font-weight="bold" fill="${color}" stroke="${BACKGROUND}" stroke-width="${LABEL_HALO_WIDTH}" paint-order="stroke" stroke-linejoin="round">${escapeXml(node.text)}</text>`,
    );
  }

  const viewBox = `${fmt(minX)} ${fmt(minY)} ${fmt(width)} ${fmt(height)}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${fmt(width)}" height="${fmt(height)}">`,
    `<rect data-role="background" x="${fmt(minX)}" y="${fmt(minY)}" width="${fmt(width)}" height="${fmt(height)}" fill="${BACKGROUND}"/>`,
    ...branches,
    ...shapes,
    ...labels,
    "</svg>",
  ].join("\n");
}
