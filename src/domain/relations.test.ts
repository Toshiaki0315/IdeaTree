import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { deleteNode } from "./deleteNode";
import { createMindMap } from "./mindmap";
import {
  MAX_RELATION_LABEL,
  findRelation,
  removeRelationsOf,
  toggleRelation,
  updateRelation,
} from "./relations";

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

describe("updateRelation（関連線のラベルと色）", () => {
  function linked() {
    const { map, ids } = sample();
    const withRelation = toggleRelation(map, ids.a, ids.b);
    return { map: withRelation, ids, id: withRelation.relations![0].id };
  }

  it("ラベルと色を設定する。元のマップは変えない", () => {
    const { map, id } = linked();

    const updated = updateRelation(map, id, { label: "依存", color: "#1A7FD1" });

    expect(updated.relations![0]).toMatchObject({ label: "依存", color: "#1A7FD1" });
    expect(map.relations![0].label).toBeUndefined();
  });

  it("指定した項目だけを変える。undefined（または、空のラベル）で、外す", () => {
    const { map, id } = linked();
    const both = updateRelation(map, id, { label: "依存", color: "#1A7FD1" });

    const onlyColor = updateRelation(both, id, { label: undefined });
    expect("label" in onlyColor.relations![0]).toBe(false);
    expect(onlyColor.relations![0].color).toBe("#1A7FD1");

    const noColor = updateRelation(both, id, { color: undefined });
    expect("color" in noColor.relations![0]).toBe(false);
    expect(noColor.relations![0].label).toBe("依存");

    expect("label" in updateRelation(both, id, { label: "  " }).relations![0]).toBe(false);
  });

  it("ラベルは、前後の空白を取り除き、改行は空白にする", () => {
    const { map, id } = linked();

    expect(updateRelation(map, id, { label: "  上の\n下 " }).relations![0].label).toBe("上の 下");
  });

  it("ほかの関連線は、変えない", () => {
    const { map, ids, id } = linked();
    const two = toggleRelation(map, ids.b, ids.c);

    const updated = updateRelation(two, id, { label: "依存" });

    expect(updated.relations![0].label).toBe("依存");
    expect(updated.relations![1]).toBe(two.relations![1]);
  });

  it("変化がなければ、同じマップを返す", () => {
    const { map, id } = linked();
    const labeled = updateRelation(map, id, { label: "依存" });

    expect(updateRelation(labeled, id, { label: "依存" })).toBe(labeled);
    expect(updateRelation(map, id, {})).toBe(map);
    expect(updateRelation(map, id, { label: undefined })).toBe(map);
  });

  it("存在しない関連線・長すぎるラベル・色の形式が不正なものは、エラーにする", () => {
    const { map, id } = linked();

    expect(() => updateRelation(map, "ghost", { label: "x" })).toThrow("関連線が存在しません: ghost");
    expect(() => updateRelation(map, id, { label: "あ".repeat(MAX_RELATION_LABEL + 1) })).toThrow(
      "ラベルが長すぎます",
    );
    expect(() => updateRelation(map, id, { color: "red" })).toThrow("色は、#RRGGBB の形式にしてください");
  });
});
