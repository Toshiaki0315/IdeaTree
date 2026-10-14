import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { deleteNode } from "./deleteNode";
import { createMindMap } from "./mindmap";
import { findRelation, removeRelationsOf, toggleRelation } from "./relations";

/** 中心の下に 企画・予算・調査（企画の子） */
function sample() {
  const root = createMindMap("中心");
  const a = addChild(root, root.rootId, "企画");
  const b = addChild(a.map, root.rootId, "予算");
  const c = addChild(b.map, a.nodeId, "調査");
  return { map: c.map, ids: { root: root.rootId, a: a.nodeId, b: b.nodeId, c: c.nodeId } };
}

describe("toggleRelation（関連線の追加・解除）", () => {
  it("2つのノードの間に、関連線を追加する。元のマップは変えない", () => {
    const { map, ids } = sample();

    const linked = toggleRelation(map, ids.a, ids.b);

    expect(linked.relations).toHaveLength(1);
    expect(linked.relations![0]).toMatchObject({ from: ids.a, to: ids.b });
    expect(typeof linked.relations![0].id).toBe("string");
    expect(map.relations).toBeUndefined();
  });

  it("すでに関連線があれば、解除する（向きが逆でも）。なくなったら、relations も外す", () => {
    const { map, ids } = sample();
    const linked = toggleRelation(map, ids.a, ids.b);

    const reverse = toggleRelation(linked, ids.b, ids.a);

    expect(reverse.relations).toBeUndefined();
    expect("relations" in reverse).toBe(false);
  });

  it("別の関連線は、残る", () => {
    const { map, ids } = sample();
    const two = toggleRelation(toggleRelation(map, ids.a, ids.b), ids.b, ids.c);

    const removed = toggleRelation(two, ids.a, ids.b);

    expect(removed.relations).toHaveLength(1);
    expect(removed.relations![0]).toMatchObject({ from: ids.b, to: ids.c });
  });

  it("中心ノードとの間も、結べる", () => {
    const { map, ids } = sample();

    expect(toggleRelation(map, ids.c, ids.root).relations).toHaveLength(1);
  });

  it("同じノードどうし・存在しないノードは、エラーにする", () => {
    const { map, ids } = sample();

    expect(() => toggleRelation(map, ids.a, ids.a)).toThrow("同じノードは、結べません");
    expect(() => toggleRelation(map, ids.a, "ghost")).toThrow("ノードが存在しません: ghost");
    expect(() => toggleRelation(map, "ghost", ids.a)).toThrow("ノードが存在しません: ghost");
  });
});

describe("findRelation", () => {
  it("2つのノードを結ぶ関連線を、向きによらず、見つける。なければ undefined", () => {
    const { map, ids } = sample();
    const linked = toggleRelation(map, ids.a, ids.b);

    expect(findRelation(linked, ids.b, ids.a)).toBe(linked.relations![0]);
    expect(findRelation(linked, ids.a, ids.c)).toBeUndefined();
    expect(findRelation(map, ids.a, ids.b)).toBeUndefined();
  });
});

describe("removeRelationsOf（ノードの関連線を、すべて外す）", () => {
  it("そのノードにつながる関連線だけを、外す", () => {
    const { map, ids } = sample();
    const linked = toggleRelation(toggleRelation(map, ids.a, ids.b), ids.b, ids.c);

    const removed = removeRelationsOf(linked, new Set([ids.a]));

    expect(removed.relations).toHaveLength(1);
    expect(removed.relations![0]).toMatchObject({ from: ids.b, to: ids.c });
  });

  it("関連線がなくなったら、relations を外す。変化がなければ、同じマップを返す", () => {
    const { map, ids } = sample();
    const linked = toggleRelation(map, ids.a, ids.b);

    expect("relations" in removeRelationsOf(linked, new Set([ids.b]))).toBe(false);
    expect(removeRelationsOf(linked, new Set([ids.c]))).toBe(linked);
    expect(removeRelationsOf(map, new Set([ids.c]))).toBe(map);
  });
});

describe("deleteNode と関連線", () => {
  it("ノードを削除すると、そのノードと、子孫につながる関連線も、なくなる", () => {
    const { map, ids } = sample();
    const linked = toggleRelation(toggleRelation(map, ids.c, ids.b), ids.b, ids.root);

    const deleted = deleteNode(linked, ids.a); // 企画とその子（調査）を削除

    expect(deleted.relations).toHaveLength(1);
    expect(deleted.relations![0]).toMatchObject({ from: ids.b, to: ids.root });
  });
});
