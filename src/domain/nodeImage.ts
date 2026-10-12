import type { MindMap, NodeId } from "./mindmap";

export const MAX_IMAGE_BYTES = 0;

export function isImageDataUrl(_value: unknown): _value is string {
  return false;
}

export function setNodeImage(_map: MindMap, _nodeId: NodeId, _image: string | undefined): MindMap {
  throw new Error("未実装");
}
