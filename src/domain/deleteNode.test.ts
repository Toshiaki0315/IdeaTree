import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { addSibling } from "./addSibling";
import { deleteNode, deleteNodes } from "./deleteNode";
import { createMindMap } from "./mindmap";
import { toggleRelation } from "./relations";

describe("deleteNode（ノードの削除）", () => {
  it("指定したノードをマップから削除し、親の childIds からも取り除く", () => {
    const map = createMindMap("A");
    const a = addChild(map, map.rootId, "1");

    const next = deleteNode(a.map, a.nodeId);

    expect(next.nodes[a.nodeId]).toBeUndefined();
    expect(next.nodes[map.rootId].childIds).toEqual([]);
  });

  it("兄弟ノードの順序は保たれる", () => {
    const map = createMindMap("A");
    const a = addChild(map, map.rootId, "1");
    const b = addSibling(a.map, a.nodeId, "2");
    const c = addSibling(b.map, b.nodeId, "3");

    const next = deleteNode(c.map, b.nodeId);

    expect(next.nodes[map.rootId].childIds).toEqual([a.nodeId, c.nodeId]);
  });

  it("子孫ノードもすべて削除される（サブツリーごと）", () => {
    const map = createMindMap("A");
    const child = addChild(map, map.rootId, "子");
    const grand = addChild(child.map, child.nodeId, "孫");
    const great = addChild(grand.map, grand.nodeId, "曾孫");

    const next = deleteNode(great.map, child.nodeId);

    expect(Object.keys(next.nodes)).toEqual([map.rootId]);
  });

  it("削除対象以外のサブツリーは残る", () => {
    const map = createMindMap("A");
    const a = addChild(map, map.rootId, "1");
    const aChild = addChild(a.map, a.nodeId, "1-1");
    const b = addSibling(aChild.map, a.nodeId, "2");

    const next = deleteNode(b.map, b.nodeId);

    expect(next.nodes[a.nodeId]).toBeDefined();
    expect(next.nodes[aChild.nodeId]).toBeDefined();
  });

  it("元のマインドマップを変更しない（イミュータブル）", () => {
    const map = createMindMap("A");
    const a = addChild(map, map.rootId, "1");

    deleteNode(a.map, a.nodeId);

    expect(a.map.nodes[a.nodeId]).toBeDefined();
    expect(a.map.nodes[map.rootId].childIds).toEqual([a.nodeId]);
  });

  it("ルート（セントラルイメージ）は削除できない", () => {
    const map = createMindMap("A");

    expect(() => deleteNode(map, map.rootId)).toThrow("ルートノードは削除できません");
  });

  it("存在しないノードIDを指定するとエラーになる", () => {
    const map = createMindMap("A");

    expect(() => deleteNode(map, "missing")).toThrow("ノードが存在しません: missing");
  });
});

describe("deleteNodes（複数のノードの削除）", () => {
  /** 中心の下に 企画（調査）と 予算 と 人事 */
  function sample() {
    const root = createMindMap("中心");
    const a = addChild(root, root.rootId, "企画");
    const a1 = addChild(a.map, a.nodeId, "調査");
    const b = addChild(a1.map, root.rootId, "予算");
    const c = addChild(b.map, root.rootId, "人事");
    return { map: c.map, ids: { root: root.rootId, a: a.nodeId, a1: a1.nodeId, b: b.nodeId, c: c.nodeId } };
  }

  it("指定したノードを、子孫ごと、すべて削除する。ほかのノードは、残る", () => {
    const { map, ids } = sample();

    const next = deleteNodes(map, [ids.a, ids.c]);

    expect(Object.keys(next.nodes).sort()).toEqual([ids.root, ids.b].sort());
    expect(next.nodes[ids.root].childIds).toEqual([ids.b]);
  });

  it("親と子の両方を指定しても、1回だけ削除する。中心ノードは、削除しない", () => {
    const { map, ids } = sample();

    const next = deleteNodes(map, [ids.a1, ids.a, ids.root]);

    expect(next.nodes[ids.a]).toBeUndefined();
    expect(next.nodes[ids.a1]).toBeUndefined();
    expect(next.nodes[ids.root]).toBeDefined();
    expect(next.nodes[ids.b]).toBeDefined();
  });

  it("削除するノードにつながる関連線も、なくなる", () => {
    const { map, ids } = sample();
    const linked = toggleRelation(toggleRelation(map, ids.a1, ids.b), ids.b, ids.c);

    const next = deleteNodes(linked, [ids.a]);

    expect(next.relations).toHaveLength(1);
    expect(next.relations![0]).toMatchObject({ from: ids.b, to: ids.c });
  });

  it("削除できるノードがなければ（空・中心ノードだけ）、同じマップを返す。元のマップは変えない", () => {
    const { map, ids } = sample();

    expect(deleteNodes(map, [])).toBe(map);
    expect(deleteNodes(map, [ids.root])).toBe(map);
    deleteNodes(map, [ids.a]);
    expect(map.nodes[ids.a]).toBeDefined();
  });
});
