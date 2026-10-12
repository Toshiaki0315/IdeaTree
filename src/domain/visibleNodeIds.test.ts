import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { addSibling } from "./addSibling";
import { toggleCollapse } from "./collapse";
import { createMindMap } from "./mindmap";
import { visibleNodeIds } from "./visibleNodeIds";

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

describe("visibleNodeIds（折りたたみを考慮した表示対象のノード）", () => {
  it("折りたたみがなければ、全ノードを深さ優先（子の順）で返す", () => {
    const { map, ids } = buildMap();

    expect(visibleNodeIds(map)).toEqual([ids.root, ids.a, ids.a1, ids.a11, ids.a2, ids.b]);
  });

  it("折りたたまれたノード自身は表示し、その子孫は除く", () => {
    const { map, ids } = buildMap();

    const folded = toggleCollapse(map, ids.a);

    expect(visibleNodeIds(folded)).toEqual([ids.root, ids.a, ids.b]);
  });

  it("折りたたまれた子孫の中の、さらに折りたたまれたノードも除かれる", () => {
    const { map, ids } = buildMap();
    const folded = toggleCollapse(toggleCollapse(map, ids.a1), ids.a);

    expect(visibleNodeIds(folded)).toEqual([ids.root, ids.a, ids.b]);
  });

  it("外側を展開すると、内側の折りたたみは保たれる", () => {
    const { map, ids } = buildMap();
    const folded = toggleCollapse(toggleCollapse(map, ids.a1), ids.a);

    const reopened = toggleCollapse(folded, ids.a);

    expect(visibleNodeIds(reopened)).toEqual([ids.root, ids.a, ids.a1, ids.a2, ids.b]);
  });

  it("中心ノードを折りたたむと、中心ノードだけになる", () => {
    const { map, ids } = buildMap();

    expect(visibleNodeIds(toggleCollapse(map, ids.root))).toEqual([ids.root]);
  });

  it("ルートだけのマップでは、ルートのみを返す", () => {
    const map = createMindMap("root");

    expect(visibleNodeIds(map)).toEqual([map.rootId]);
  });

  it("子を持たないノードに残った折りたたみ状態は、表示に影響しない", () => {
    const { map, ids } = buildMap();
    const stale = {
      ...map,
      nodes: { ...map.nodes, [ids.b]: { ...map.nodes[ids.b], collapsed: true } },
    };

    expect(visibleNodeIds(stale)).toEqual(visibleNodeIds(map));
  });

  it("元のマインドマップを変更しない", () => {
    const { map, ids } = buildMap();
    const folded = toggleCollapse(map, ids.a);
    const before = structuredClone(folded);

    visibleNodeIds(folded);

    expect(folded).toEqual(before);
  });
});
