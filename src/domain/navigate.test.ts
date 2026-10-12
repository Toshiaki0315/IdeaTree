import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { addSibling } from "./addSibling";
import { createMindMap } from "./mindmap";
import { navigate } from "./navigate";

/** root ─ a(a1, a2) / b / c の構造を作る */
function buildMap() {
  const map = createMindMap("root");
  const a = addChild(map, map.rootId, "a");
  const b = addSibling(a.map, a.nodeId, "b");
  const c = addSibling(b.map, b.nodeId, "c");
  const a1 = addChild(c.map, a.nodeId, "a1");
  const a2 = addSibling(a1.map, a1.nodeId, "a2");
  return {
    map: a2.map,
    root: map.rootId,
    a: a.nodeId,
    b: b.nodeId,
    c: c.nodeId,
    a1: a1.nodeId,
    a2: a2.nodeId,
  };
}

describe("navigate（矢印キーによるノード間移動）", () => {
  it("parent: 親ノードへ移動する", () => {
    const t = buildMap();

    expect(navigate(t.map, t.a1, "parent")).toBe(t.a);
  });

  it("parent: ルートでは移動せず自分自身を返す", () => {
    const t = buildMap();

    expect(navigate(t.map, t.root, "parent")).toBe(t.root);
  });

  it("firstChild: 最初の子ノードへ移動する", () => {
    const t = buildMap();

    expect(navigate(t.map, t.a, "firstChild")).toBe(t.a1);
    expect(navigate(t.map, t.root, "firstChild")).toBe(t.a);
  });

  it("firstChild: 子がなければ移動せず自分自身を返す", () => {
    const t = buildMap();

    expect(navigate(t.map, t.b, "firstChild")).toBe(t.b);
  });

  it("nextSibling: 次の兄弟ノードへ移動する", () => {
    const t = buildMap();

    expect(navigate(t.map, t.a, "nextSibling")).toBe(t.b);
    expect(navigate(t.map, t.a1, "nextSibling")).toBe(t.a2);
  });

  it("nextSibling: 末尾の兄弟では移動せず自分自身を返す", () => {
    const t = buildMap();

    expect(navigate(t.map, t.c, "nextSibling")).toBe(t.c);
  });

  it("prevSibling: 前の兄弟ノードへ移動する", () => {
    const t = buildMap();

    expect(navigate(t.map, t.c, "prevSibling")).toBe(t.b);
    expect(navigate(t.map, t.a2, "prevSibling")).toBe(t.a1);
  });

  it("prevSibling: 先頭の兄弟では移動せず自分自身を返す", () => {
    const t = buildMap();

    expect(navigate(t.map, t.a, "prevSibling")).toBe(t.a);
  });

  it("ルートには兄弟がいないので、兄弟方向では移動しない", () => {
    const t = buildMap();

    expect(navigate(t.map, t.root, "nextSibling")).toBe(t.root);
    expect(navigate(t.map, t.root, "prevSibling")).toBe(t.root);
  });

  it("存在しないノードIDを指定するとエラーになる", () => {
    const t = buildMap();

    expect(() => navigate(t.map, "missing", "parent")).toThrow("ノードが存在しません: missing");
  });
});
