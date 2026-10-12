import type { MindMap, MindMapNode, NodeId } from "./mindmap";

/** ノードに設定できる画像の大きさの上限（元のバイト数）。JSON に埋め込むので、大きくしすぎない */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// SVG は、スクリプトを含められるので、対象外にする
const DATA_URL_PATTERN = /^data:image\/(?:png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+)(={0,2})$/;

/** base64 のデータから、元のバイト数を求める */
function decodedBytes(payload: string, padding: string): number {
  return Math.floor((payload.length * 3) / 4) - padding.length;
}

/** 値が、PNG・JPEG・GIF・WebP の base64 のデータURLで、大きさが上限以内か */
export function isImageDataUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATA_URL_PATTERN.exec(value);
  return match !== null && decodedBytes(match[1], match[2]) <= MAX_IMAGE_BYTES;
}

/**
 * ノードの画像を設定する（undefined で外す）。元のマップは変更しない。
 * 変化がなければ、同じマップを返す。
 */
export function setNodeImage(map: MindMap, nodeId: NodeId, image: string | undefined): MindMap {
  const node = map.nodes[nodeId];
  if (!node) {
    throw new Error(`ノードが存在しません: ${nodeId}`);
  }

  if (image !== undefined) {
    const match = DATA_URL_PATTERN.exec(image);
    if (match === null) {
      throw new Error("画像の形式が不正です（PNG・JPEG・GIF・WebP のみ）");
    }
    if (decodedBytes(match[1], match[2]) > MAX_IMAGE_BYTES) {
      throw new Error(`画像が大きすぎます（上限 ${MAX_IMAGE_BYTES / 1024 / 1024} MB）`);
    }
  }
  if (node.image === image) return map;

  const updated: MindMapNode = { ...node, image };
  if (image === undefined) delete updated.image;
  return { ...map, nodes: { ...map.nodes, [nodeId]: updated } };
}
