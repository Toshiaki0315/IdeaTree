import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { addSibling } from "./addSibling";
import { toggleCollapse } from "./collapse";
import { createMindMap } from "./mindmap";
import type { MindMap, NodeId } from "./mindmap";

/** root ─ a(a1(a11), a2) / b の木 */
function buildMap() {
  const base = createMindMap("root");
  const a = addChild(base, base.rootId, "a");
  const b = addSibling(a.map, a.nodeId, "b");
  const a1 = addChild(b.map, a.nodeId, "a1");
  const a2 = addSibling(a1.map, a1.nodeId, "a2");
  const a11 = addChild(a2.map, a1.nodeId, "a11");
  return {
    map: a11.map,
    ids: { root: base.rootId, a: a.nodeId, b: b.nodeId, a1: a1.nodeId, a2: a2.nodeId, a11: a11.nodeId },
  };
}

const collapsedOf = (map: MindMap, id: NodeId) => map.nodes[id].collapsed;

describe("toggleCollapse（折りたたみ / Space）", () => {
  it("子を持つノードを折りたたみ、もう一度で展開する", () => {
    const { map, ids } = buildMap();

    const folded = toggleCollapse(map, ids.a);
    expect(collapsedOf(folded, ids.a)).toBe(true);

    const unfolded = toggleCollapse(folded, ids.a);
    expect(collapsedOf(unfolded, ids.a)).toBe(false);
  });

  it("折りたたんでも、子孫のデータは削除されず、そのまま保持される", () => {
    const { map, ids } = buildMap();

    const folded = toggleCollapse(map, ids.a);

    expect(Object.keys(folded.nodes)).toEqual(Object.keys(map.nodes));
    expect(folded.nodes[ids.a].childIds).toEqual([ids.a1, ids.a2]);
    expect(folded.nodes[ids.a1]).toEqual(map.nodes[ids.a1]);
  });

  it("他のノードの折りたたみ状態は変わらない（子孫が個別に折りたたまれていても保たれる）", () => {
    const { map, ids } = buildMap();
    const innerFolded = toggleCollapse(map, ids.a1);

    const both = toggleCollapse(innerFolded, ids.a);
    expect(collapsedOf(both, ids.a1)).toBe(true);

    const reopened = toggleCollapse(both, ids.a);
    expect(collapsedOf(reopened, ids.a1)).toBe(true);
    expect(collapsedOf(reopened, ids.b)).toBeUndefined();
  });

  it("中心ノードも折りたためる", () => {
    const { map, ids } = buildMap();

    expect(collapsedOf(toggleCollapse(map, ids.root), ids.root)).toBe(true);
  });

  it("子を持たないノードは折りたためず、同じマップをそのまま返す", () => {
    const { map, ids } = buildMap();

    expect(toggleCollapse(map, ids.b)).toBe(map);
    expect(toggleCollapse(map, ids.a11)).toBe(map);
  });

  it("子を失ったのに折りたたみが残っているノードは、展開状態に戻せる", () => {
    const { map, ids } = buildMap();
    const stale: MindMap = {
      ...map,
      nodes: { ...map.nodes, [ids.b]: { ...map.nodes[ids.b], collapsed: true } },
    };

    expect(collapsedOf(toggleCollapse(stale, ids.b), ids.b)).toBe(false);
  });

  it("元のマインドマップを変更しない（イミュータブル）", () => {
    const { map, ids } = buildMap();
    const before = structuredClone(map);

    toggleCollapse(map, ids.a);

    expect(map).toEqual(before);
  });

  it("存在しないノードIDを指定するとエラーになる", () => {
    const { map } = buildMap();

    expect(() => toggleCollapse(map, "missing")).toThrow("ノードが存在しません: missing");
  });
});
