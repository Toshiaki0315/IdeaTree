import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { createMindMap } from "./mindmap";
import { updateText } from "./updateText";

describe("updateText（ノードのテキスト編集 / F2・Enter）", () => {
  it("指定したノードのテキストを更新する", () => {
    const map = createMindMap("A");
    const a = addChild(map, map.rootId, "旧");

    const next = updateText(a.map, a.nodeId, "新");

    expect(next.nodes[a.nodeId].text).toBe("新");
  });

  it("ルート（セントラルイメージ）のテキストも更新できる", () => {
    const map = createMindMap("A");

    expect(updateText(map, map.rootId, "B").nodes[map.rootId].text).toBe("B");
  });

  it("テキスト以外のプロパティと他のノードは変わらない", () => {
    const map = createMindMap("A");
    const a = addChild(map, map.rootId, "旧");

    const next = updateText(a.map, a.nodeId, "新");

    expect(next.nodes[a.nodeId]).toEqual({ ...a.map.nodes[a.nodeId], text: "新" });
    expect(next.nodes[map.rootId]).toEqual(a.map.nodes[map.rootId]);
    expect(next.rootId).toBe(map.rootId);
  });

  it("空文字列にも更新できる", () => {
    const map = createMindMap("A");

    expect(updateText(map, map.rootId, "").nodes[map.rootId].text).toBe("");
  });

  it("元のマインドマップを変更しない（イミュータブル）", () => {
    const map = createMindMap("A");

    updateText(map, map.rootId, "B");

    expect(map.nodes[map.rootId].text).toBe("A");
  });

  it("存在しないノードIDを指定するとエラーになる", () => {
    const map = createMindMap("A");

    expect(() => updateText(map, "missing", "x")).toThrow("ノードが存在しません: missing");
  });
});
