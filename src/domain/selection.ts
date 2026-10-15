import type { MindMap, NodeId } from "./mindmap";

/**
 * 複数選択のうち、対象（最上位のノード）。中心ノードと、祖先も選択されているノード（子孫）は除く
 * （子孫は、祖先と一緒に扱われるので、二重に扱わないため）。重複は 1 つにして、順序は保つ。
 */
export function topmostNodes(map: MindMap, ids: readonly NodeId[]): NodeId[] {
  // 中心ノードは、動かせないので、選択から除く（全体が、中心ノードの子孫なので、除かないと、すべてが除かれてしまう）
  const selected = new Set(ids.filter((id) => map.nodes[id].parentId !== null));
  const hasSelectedAncestor = (id: NodeId) => {
    for (let parent = map.nodes[id].parentId; parent !== null; parent = map.nodes[parent].parentId) {
      if (selected.has(parent)) return true;
    }
    return false;
  };
  return [...selected].filter((id) => !hasSelectedAncestor(id));
}
