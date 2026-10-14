import { fmt } from "./format";
import {
  BACKGROUND,
  CENTRAL_RX,
  CENTRAL_RY,
  LABEL_HALO_WIDTH,
  branchPath,
  centralLabelY,
  depthOf,
  iconPlacement,
  iconTransform,
  imageBox,
  labelPosition,
  nodeLabel,
  nodeTextStyle,
  strokeWidthAt,
} from "./nodeGeometry";
import { iconShapeAttributes, iconShapes } from "./nodeIcon";
import type { MindMap, NodeId } from "./mindmap";
import { visibleNodeIds } from "./visibleNodeIds";
import { labelBlock, lineCenters } from "./wrapLabel";

const MARGIN = 120;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * ラベルの <text> 要素。長いラベルは折り返し、行ごとの <tspan> に分けて、
 * 全体の中心が (x, y) になるよう、上下に並べる。1行なら、tspan は使わない。
 */
export function svgLabel(attributes: string, label: string, fontSize: number, x: number, y: number): string {
  const { lines } = labelBlock(label, fontSize);
  if (lines.length === 1) {
    return `<text ${attributes} x="${fmt(x)}" y="${fmt(y)}">${escapeXml(lines[0])}</text>`;
  }
  const ys = lineCenters(lines.length, fontSize, y);
  const spans = lines.map((line, i) => `<tspan x="${fmt(x)}" y="${fmt(ys[i])}">${escapeXml(line)}</tspan>`);
  return `<text ${attributes} x="${fmt(x)}" y="${fmt(y)}">${spans.join("")}</text>`;
}

/** レイアウト済みのマインドマップを、SVG文書（文字列）に変換する */
export function exportSvg(map: MindMap): string {
  const nodes = visibleNodeIds(map).map((id) => map.nodes[id]);
  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  const minX = Math.min(...xs) - MARGIN;
  const minY = Math.min(...ys) - MARGIN;
  const width = Math.max(...xs) + MARGIN - minX;
  const height = Math.max(...ys) + MARGIN - minY;

  const branches: string[] = [];
  const shapes: string[] = [];
  const images: string[] = [];
  const labels: string[] = [];

  for (const node of nodes) {
    const id: NodeId = escapeXml(node.id);
    const depth = depthOf(map, node);
    const { x, y } = node.position;

    const look = nodeTextStyle(map, node);
    const font = `font-family="${escapeXml(look.fontFamily)}" font-size="${look.fontSize}" font-weight="${look.fontWeight}" font-style="${look.fontStyle}"`;

    if (node.image) {
      const box = imageBox(map, node);
      images.push(
        `<image data-node-id="${id}" href="${escapeXml(node.image)}" preserveAspectRatio="xMidYMid meet" x="${fmt(box.x)}" y="${fmt(box.y)}" width="${box.width}" height="${box.height}"/>`,
      );
    }

    if (node.icon) {
      const paths = iconShapes(node.icon).map((shape) => {
        const a = iconShapeAttributes(shape);
        return `<path d="${a.d}" fill="${a.fill}" stroke="${a.stroke}" stroke-width="${a.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
      });
      labels.push(
        `<g data-icon-for="${id}" data-icon="${escapeXml(node.icon)}" transform="${iconTransform(iconPlacement(map, node))}">${paths.join("")}</g>`,
      );
    }

    if (node.parentId === null) {
      // 画像があるときは、楕円の代わりに画像を描く
      if (!node.image) {
        shapes.push(
          `<ellipse data-node-id="${id}" cx="${fmt(x)}" cy="${fmt(y)}" rx="${CENTRAL_RX}" ry="${CENTRAL_RY}" fill="${BACKGROUND}" stroke="${look.color}" stroke-width="4"/>`,
        );
      }
      labels.push(
        svgLabel(
          `data-node-id="${id}" text-anchor="middle" dominant-baseline="central" ${font} fill="${look.color}"`,
          nodeLabel(node),
          look.fontSize,
          x,
          centralLabelY(node),
        ),
      );
      continue;
    }

    const color = look.color;
    const strokeWidth = strokeWidthAt(depth);
    branches.push(
      `<path data-node-id="${id}" d="${branchPath(map.nodes[node.parentId], node)}" fill="none" stroke="${color}" stroke-width="${fmt(strokeWidth)}" stroke-linecap="round"/>`,
    );
    // ブランチのテキストは枝の中点に置く（枝の先で子ブランチと重ならない）
    const { x: labelX, y: labelY } = labelPosition(map, node);
    labels.push(
      svgLabel(
        `data-node-id="${id}" text-anchor="middle" dominant-baseline="central" ${font} fill="${color}" stroke="${BACKGROUND}" stroke-width="${LABEL_HALO_WIDTH}" paint-order="stroke" stroke-linejoin="round"`,
        nodeLabel(node),
        look.fontSize,
        labelX,
        labelY,
      ),
    );
  }

  const viewBox = `${fmt(minX)} ${fmt(minY)} ${fmt(width)} ${fmt(height)}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${fmt(width)}" height="${fmt(height)}">`,
    `<rect data-role="background" x="${fmt(minX)}" y="${fmt(minY)}" width="${fmt(width)}" height="${fmt(height)}" fill="${BACKGROUND}"/>`,
    ...branches,
    ...shapes,
    ...images,
    ...labels,
    "</svg>",
  ].join("\n");
}
