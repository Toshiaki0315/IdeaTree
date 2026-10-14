import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { layout } from "./layout";
import { createMindMap } from "./mindmap";
import { nudgeNode, resetOffsets, setNodeOffset } from "./nodeOffset";

/** 中心の下に 企画（調査・競合）と 予算 */
function sample() {
  const root = createMindMap("中心");
  const a = addChild(root, root.rootId, "企画");
  const a1 = addChild(a.map, a.nodeId, "調査");
  const a2 = addChild(a1.map, a.nodeId, "競合");
  const b = addChild(a2.map, root.rootId, "予算");
  return { map: b.map, ids: { root: root.rootId, a: a.nodeId, a1: a1.nodeId, a2: a2.nodeId, b: b.nodeId } };
}

describe("setNodeOffset（手動配置: 自動配置からのずれ）", () => {
  it("ずれを設定する。元のマップは変えない", () => {
    const { map, ids } = sample();

    const moved = setNodeOffset(map, ids.a, { x: 30, y: -20 });

    expect(moved.nodes[ids.a].offset).toEqual({ x: 30, y: -20 });
    expect(map.nodes[ids.a].offset).toBeUndefined();
  });

  it("ずれが 0 なら、項目ごと外す。undefined でも外す。変化がなければ、同じマップを返す", () => {
    const { map, ids } = sample();
    const moved = setNodeOffset(map, ids.a, { x: 5, y: 5 });

    expect("offset" in setNodeOffset(moved, ids.a, { x: 0, y: 0 }).nodes[ids.a]).toBe(false);
    expect("offset" in setNodeOffset(moved, ids.a, undefined).nodes[ids.a]).toBe(false);
    expect(setNodeOffset(moved, ids.a, { x: 5, y: 5 })).toBe(moved);
    expect(setNodeOffset(map, ids.a, undefined)).toBe(map);
    expect(setNodeOffset(map, ids.a, { x: 0, y: 0 })).toBe(map);
  });

  it("中心ノードは、動かせない。存在しないノード・有限でない数は、エラー", () => {
    const { map, ids } = sample();

    expect(() => setNodeOffset(map, ids.root, { x: 1, y: 1 })).toThrow("中心ノードは、動かせません");
    expect(() => setNodeOffset(map, "ghost", { x: 1, y: 1 })).toThrow("ノードが存在しません: ghost");
    expect(() => setNodeOffset(map, ids.a, { x: Infinity, y: 0 })).toThrow("位置のずれが不正です");
    expect(() => setNodeOffset(map, ids.a, { x: 0, y: NaN })).toThrow("位置のずれが不正です");
  });
});

describe("nudgeNode（少しずつ動かす）", () => {
  it("今のずれに、指定した量を足す。元に戻ったら、項目を外す", () => {
    const { map, ids } = sample();

    const once = nudgeNode(map, ids.a, 20, 0);
    const twice = nudgeNode(once, ids.a, 0, -20);
    expect(twice.nodes[ids.a].offset).toEqual({ x: 20, y: -20 });

    const back = nudgeNode(nudgeNode(twice, ids.a, -20, 0), ids.a, 0, 20);
    expect("offset" in back.nodes[ids.a]).toBe(false);
  });
});

describe("resetOffsets（自動配置に戻す）", () => {
  it("そのノードと、子孫のずれを、すべて外す。ほかのノードは、そのまま", () => {
    const { map, ids } = sample();
    let moved = setNodeOffset(map, ids.a, { x: 10, y: 10 });
    moved = setNodeOffset(moved, ids.a1, { x: 5, y: 0 });
    moved = setNodeOffset(moved, ids.b, { x: 0, y: 7 });

    const reset = resetOffsets(moved, ids.a);

    expect(reset.nodes[ids.a].offset).toBeUndefined();
    expect(reset.nodes[ids.a1].offset).toBeUndefined();
    expect(reset.nodes[ids.b].offset).toEqual({ x: 0, y: 7 });
  });

  it("中心ノードを指定すると、すべて自動配置に戻す。変化がなければ、同じマップ", () => {
    const { map, ids } = sample();
    const moved = setNodeOffset(setNodeOffset(map, ids.a, { x: 1, y: 1 }), ids.b, { x: 2, y: 2 });

    const reset = resetOffsets(moved, ids.root);

    expect(Object.values(reset.nodes).some((n) => n.offset !== undefined)).toBe(false);
    expect(resetOffsets(map, ids.root)).toBe(map);
    expect(resetOffsets(map, ids.a)).toBe(map);
  });
});

describe("layout と手動配置", () => {
  it("ずれを設定したノードと、その子孫が、同じだけ動く。ほかのノードは、動かない", () => {
    const { map, ids } = sample();
    const auto = layout(map);

    const moved = layout(setNodeOffset(map, ids.a, { x: 40, y: -25 }));

    for (const id of [ids.a, ids.a1, ids.a2]) {
      expect(moved.nodes[id].position.x).toBeCloseTo(auto.nodes[id].position.x + 40);
      expect(moved.nodes[id].position.y).toBeCloseTo(auto.nodes[id].position.y - 25);
    }
    expect(moved.nodes[ids.b].position).toEqual(auto.nodes[ids.b].position);
    expect(moved.nodes[ids.root].position).toEqual({ x: 0, y: 0 });
  });

  it("子孫のずれは、親のずれに、足される", () => {
    const { map, ids } = sample();
    const auto = layout(map);

    const moved = layout(setNodeOffset(setNodeOffset(map, ids.a, { x: 10, y: 0 }), ids.a1, { x: 0, y: 30 }));

    expect(moved.nodes[ids.a1].position.x).toBeCloseTo(auto.nodes[ids.a1].position.x + 10);
    expect(moved.nodes[ids.a1].position.y).toBeCloseTo(auto.nodes[ids.a1].position.y + 30);
    expect(moved.nodes[ids.a2].position.x).toBeCloseTo(auto.nodes[ids.a2].position.x + 10);
    expect(moved.nodes[ids.a2].position.y).toBeCloseTo(auto.nodes[ids.a2].position.y);
  });

  it("折りたたまれたノードの子孫も、一緒に動く（同じ位置のまま）", () => {
    const { map, ids } = sample();
    const folded = { ...map, nodes: { ...map.nodes, [ids.a]: { ...map.nodes[ids.a], collapsed: true } } };

    const moved = layout(setNodeOffset(folded, ids.a, { x: 15, y: 15 }));

    expect(moved.nodes[ids.a1].position).toEqual(moved.nodes[ids.a].position);
  });

  it("再度レイアウトしても、ずれが二重に足されない（冪等）", () => {
    const { map, ids } = sample();
    const once = layout(setNodeOffset(map, ids.a, { x: 40, y: 0 }));

    expect(layout(once).nodes[ids.a].position).toEqual(once.nodes[ids.a].position);
  });
});
