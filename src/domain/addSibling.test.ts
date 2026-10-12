import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { addSibling } from "./addSibling";
import { createMindMap } from "./mindmap";

describe("addSibling（兄弟ノードの追加 / Enterキー）", () => {
  it("同じ親を持つブランチノードを追加し、そのIDを返す", () => {
    const map = createMindMap("A");
    const a = addChild(map, map.rootId, "1");

    const { map: next, nodeId } = addSibling(a.map, a.nodeId, "2");

    const sibling = next.nodes[nodeId];
    expect(sibling.kind).toBe("branch");
    expect(sibling.text).toBe("2");
    expect(sibling.parentId).toBe(map.rootId);
    expect(sibling.childIds).toEqual([]);
  });

  it("基準ノードの直後に挿入される", () => {
    const map = createMindMap("A");
    const a = addChild(map, map.rootId, "1");
    const c = addChild(a.map, map.rootId, "3");

    const b = addSibling(c.map, a.nodeId, "2");

    expect(b.map.nodes[map.rootId].childIds).toEqual([a.nodeId, b.nodeId, c.nodeId]);
  });

  it("末尾のノードの兄弟は末尾に追加される", () => {
    const map = createMindMap("A");
    const a = addChild(map, map.rootId, "1");

    const b = addSibling(a.map, a.nodeId, "2");

    expect(b.map.nodes[map.rootId].childIds).toEqual([a.nodeId, b.nodeId]);
  });

  it("元のマインドマップを変更しない（イミュータブル）", () => {
    const map = createMindMap("A");
    const a = addChild(map, map.rootId, "1");

    addSibling(a.map, a.nodeId, "2");

    expect(a.map.nodes[map.rootId].childIds).toEqual([a.nodeId]);
    expect(Object.keys(a.map.nodes)).toHaveLength(2);
  });

  it("ルート（セントラルイメージ）には兄弟を追加できない", () => {
    const map = createMindMap("A");

    expect(() => addSibling(map, map.rootId, "x")).toThrow(
      "ルートノードには兄弟ノードを追加できません",
    );
  });

  it("存在しないノードIDを指定するとエラーになる", () => {
    const map = createMindMap("A");

    expect(() => addSibling(map, "missing", "x")).toThrow("ノードが存在しません: missing");
  });
});
