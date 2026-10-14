import type { MindMap } from "./mindmap";

/** JSON保存フォーマットのバージョン */
export const SAVE_FORMAT_VERSION = 1;

/** マインドマップをJSON保存用の文字列に変換する */
export function serialize(map: MindMap): string {
  return JSON.stringify({ version: SAVE_FORMAT_VERSION, rootId: map.rootId, nodes: map.nodes }, null, 2);
}
