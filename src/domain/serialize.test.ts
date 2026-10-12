import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { createMindMap } from "./mindmap";
import { SAVE_FORMAT_VERSION, serialize } from "./serialize";

describe("serialize（JSON保存用のシリアライズ / Cmd+S）", () => {
  it("フォーマットのバージョンを含むJSON文字列を返す", () => {
    const json = serialize(createMindMap("A"));

    expect(JSON.parse(json).version).toBe(SAVE_FORMAT_VERSION);
    expect(SAVE_FORMAT_VERSION).toBe(1);
  });

  it("rootId と全ノードを含む", () => {
    const map = createMindMap("A");
    const a = addChild(map, map.rootId, "子");

    const data = JSON.parse(serialize(a.map));

    expect(data.rootId).toBe(map.rootId);
    expect(Object.keys(data.nodes).sort()).toEqual([map.rootId, a.nodeId].sort());
  });

  it("各ノードの id・kind・text・parentId・childIds・position を保持する", () => {
    const map = createMindMap("A");
    const a = addChild(map, map.rootId, "子");

    const data = JSON.parse(serialize(a.map));

    expect(data.nodes[map.rootId]).toEqual({
      id: map.rootId,
      kind: "central",
      text: "A",
      parentId: null,
      childIds: [a.nodeId],
      position: { x: 0, y: 0 },
    });
    expect(data.nodes[a.nodeId].parentId).toBe(map.rootId);
    expect(data.nodes[a.nodeId].kind).toBe("branch");
  });

  it("日本語テキストがエスケープされず、そのまま読める", () => {
    expect(serialize(createMindMap("アイデア"))).toContain("アイデア");
  });

  it("人が読める・差分が取りやすいようインデント付きで出力する", () => {
    expect(serialize(createMindMap("A"))).toContain("\n  ");
  });

  it("同じマップからは常に同じ文字列を返す", () => {
    const map = createMindMap("A");

    expect(serialize(map)).toBe(serialize(map));
  });

  it("元のマインドマップを変更しない", () => {
    const map = createMindMap("A");
    const before = structuredClone(map);

    serialize(map);

    expect(map).toEqual(before);
  });
});
