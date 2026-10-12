import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { addSibling } from "./addSibling";
import { deleteNode } from "./deleteNode";
import { createMindMap } from "./mindmap";

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
