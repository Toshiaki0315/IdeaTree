import type { MindMap, NodeId } from "./mindmap";

export const ICON_PRESETS: { name: string; value: string }[] = [];

export function isIcon(_value: unknown): _value is string {
  return false;
}

export function setNodeIcon(_map: MindMap, _nodeId: NodeId, _icon: string | undefined): MindMap {
  throw new Error("未実装");
}
