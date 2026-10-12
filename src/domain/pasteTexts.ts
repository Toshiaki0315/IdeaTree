import { addChild } from "./addChild";
import { toggleCollapse } from "./collapse";
import type { MindMap, NodeId } from "./mindmap";

/**
 * テキストの行を、貼り付け先の子の末尾に、1行1ノードで追加する（元のマップは変更しない）。
 * 空行は無視し、前後の空白は取り除く。折りたたまれた貼り付け先は、展開する。
 * 貼り付ける行がなければ、同じマップを返す。
 */
export function pasteTexts(
  map: MindMap,
  targetId: NodeId,
  lines: string[],
): { map: MindMap; nodeIds: NodeId[] } {
  const target = map.nodes[targetId];
  if (!target) {
    throw new Error(`貼り付け先のノードが存在しません: ${targetId}`);
  }

  const texts = lines.map((line) => line.trim()).filter((line) => line !== "");
  if (texts.length === 0) return { map, nodeIds: [] };

  let current = target.collapsed ? toggleCollapse(map, targetId) : map;
  const nodeIds: NodeId[] = [];
  for (const text of texts) {
    const added = addChild(current, targetId, text);
    current = added.map;
    nodeIds.push(added.nodeId);
  }
  return { map: current, nodeIds };
}
