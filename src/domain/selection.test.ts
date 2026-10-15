import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { createMindMap } from "./mindmap";
import { topmostNodes } from "./selection";

/** 中心の下に 企画（調査・競合）と 予算 */
function sample() {
  const root = createMindMap("中心");
  const a = addChild(root, root.rootId, "企画");
  const a1 = addChild(a.map, a.nodeId, "調査");
  const a2 = addChild(a1.map, a.nodeId, "競合");
  const b = addChild(a2.map, root.rootId, "予算");
  return { map: b.map, ids: { root: root.rootId, a: a.nodeId, a1: a1.nodeId, a2: a2.nodeId, b: b.nodeId } };
}

describe("topmostNodes（複数選択の、対象）", () => {
  it("選択したノードのうち、祖先も選択されているもの（子孫）と、中心ノードを除く", () => {
    const { map, ids } = sample();

    expect(topmostNodes(map, [ids.a, ids.a1, ids.b, ids.root])).toEqual([ids.a, ids.b]);
  });

  it("子孫だけでも、除かれない。重複は、1つにする。順序は、保つ", () => {
    const { map, ids } = sample();

    expect(topmostNodes(map, [ids.a1, ids.a2, ids.a1])).toEqual([ids.a1, ids.a2]);
    expect(topmostNodes(map, [])).toEqual([]);
  });
});
