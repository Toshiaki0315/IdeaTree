import { describe, expect, it } from "vitest";
import { BRANCH_COLORS } from "./branchColor";
import { createMindMap } from "./mindmap";
import { addChild } from "./addChild";

describe("addChild（子ノードの追加 / Tabキー）", () => {
  it("指定した親の子としてブランチノードを追加し、そのIDを返す", () => {
    const map = createMindMap("アイデア");

    const { map: next, nodeId } = addChild(map, map.rootId, "企画");

    const child = next.nodes[nodeId];
    expect(child.kind).toBe("branch");
    expect(child.text).toBe("企画");
    expect(child.parentId).toBe(map.rootId);
    expect(child.childIds).toEqual([]);
  });

  it("親ノードの childIds の末尾に追加される", () => {
    const map = createMindMap("A");
    const a = addChild(map, map.rootId, "1");
    const b = addChild(a.map, map.rootId, "2");

    expect(b.map.nodes[map.rootId].childIds).toEqual([a.nodeId, b.nodeId]);
  });

  it("孫ノードも追加できる", () => {
    const map = createMindMap("A");
    const child = addChild(map, map.rootId, "子");
    const grand = addChild(child.map, child.nodeId, "孫");

    expect(grand.map.nodes[grand.nodeId].parentId).toBe(child.nodeId);
    expect(grand.map.nodes[child.nodeId].childIds).toEqual([grand.nodeId]);
  });

  it("元のマインドマップを変更しない（イミュータブル）", () => {
    const map = createMindMap("A");

    addChild(map, map.rootId, "子");

    expect(Object.keys(map.nodes)).toHaveLength(1);
    expect(map.nodes[map.rootId].childIds).toEqual([]);
  });

  it("存在しない親IDを指定するとエラーになる", () => {
    const map = createMindMap("A");

    expect(() => addChild(map, "missing", "子")).toThrow("親ノードが存在しません: missing");
  });
});

describe("addChild（メインブランチの色の割り当て）", () => {
  it("中心ノードの子（メインブランチ）には、次の色が保存される", () => {
    const map = createMindMap("A");

    const first = addChild(map, map.rootId, "1");
    const second = addChild(first.map, map.rootId, "2");

    expect(first.map.nodes[first.nodeId].branchColor).toBe(BRANCH_COLORS[0]);
    expect(second.map.nodes[second.nodeId].branchColor).toBe(BRANCH_COLORS[1]);
  });

  it("メインブランチ以外の子には、色は保存されない（親から引き継ぐ）", () => {
    const map = createMindMap("A");
    const main = addChild(map, map.rootId, "1");

    const sub = addChild(main.map, main.nodeId, "1-1");

    expect("branchColor" in sub.map.nodes[sub.nodeId]).toBe(false);
  });
});
