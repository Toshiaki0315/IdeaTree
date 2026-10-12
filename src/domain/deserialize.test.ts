import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { addSibling } from "./addSibling";
import { deserialize } from "./deserialize";
import { createMindMap } from "./mindmap";
import { serialize } from "./serialize";

/** 正常なJSONデータ（オブジェクト）を作り、加工してから文字列化するヘルパー */
function validData() {
  const map = createMindMap("root");
  const a = addChild(map, map.rootId, "a");
  const b = addSibling(a.map, a.nodeId, "b");
  return {
    ids: { root: map.rootId, a: a.nodeId, b: b.nodeId },
    data: JSON.parse(serialize(b.map)),
  };
}

describe("deserialize（JSON読み込み）", () => {
  it("serialize した結果を元のマップに復元できる（往復）", () => {
    const { data } = validData();
    const json = JSON.stringify(data);

    const map = deserialize(json);

    expect(serialize(map)).toBe(serialize(deserialize(serialize(map))));
    expect(map.rootId).toBe(data.rootId);
    expect(map.nodes).toEqual(data.nodes);
  });

  it("日本語テキストを含むマップを往復できる", () => {
    const base = createMindMap("アイデア");
    const original = addChild(base, base.rootId, "発想").map;

    expect(deserialize(serialize(original))).toEqual(original);
  });

  it("JSONとして不正な文字列はエラーになる", () => {
    expect(() => deserialize("{ not json")).toThrow("JSONの形式が不正です");
  });

  it.each([["null"], ["[]"], ['"text"'], ["123"]])(
    "オブジェクトでないJSON（%s）はエラーになる",
    (json) => {
      expect(() => deserialize(json)).toThrow("保存データの形式が不正です");
    },
  );

  it("未対応のバージョンはエラーになる", () => {
    const { data } = validData();
    data.version = 999;

    expect(() => deserialize(JSON.stringify(data))).toThrow("未対応のバージョンです: 999");
  });

  it("versionがない場合はエラーになる", () => {
    const { data } = validData();
    delete data.version;

    expect(() => deserialize(JSON.stringify(data))).toThrow("未対応のバージョンです: undefined");
  });

  it("rootId が文字列でない場合はエラーになる", () => {
    const { data } = validData();
    data.rootId = 1;

    expect(() => deserialize(JSON.stringify(data))).toThrow("保存データの形式が不正です");
  });

  it("nodes がオブジェクトでない場合はエラーになる", () => {
    const { data } = validData();
    data.nodes = [];

    expect(() => deserialize(JSON.stringify(data))).toThrow("保存データの形式が不正です");
  });

  it("rootId に対応するノードがなければエラーになる", () => {
    const { data } = validData();
    data.rootId = "missing";

    expect(() => deserialize(JSON.stringify(data))).toThrow("ルートノードが存在しません");
  });

  it("ルートが親を持っている場合はエラーになる", () => {
    const { data, ids } = validData();
    data.nodes[ids.root].parentId = ids.a;

    expect(() => deserialize(JSON.stringify(data))).toThrow("ルートノードに親があります");
  });

  it("ノードの形式が不正な場合はエラーになる", () => {
    const { data, ids } = validData();
    delete data.nodes[ids.a].text;

    expect(() => deserialize(JSON.stringify(data))).toThrow(
      `ノードの形式が不正です: ${ids.a}`,
    );
  });

  it("ノードのキーと id が一致しない場合はエラーになる", () => {
    const { data, ids } = validData();
    data.nodes[ids.a].id = "other";

    expect(() => deserialize(JSON.stringify(data))).toThrow(
      `ノードの形式が不正です: ${ids.a}`,
    );
  });

  it("childIds が存在しないノードを指していればエラーになる", () => {
    const { data, ids } = validData();
    data.nodes[ids.root].childIds.push("ghost");

    expect(() => deserialize(JSON.stringify(data))).toThrow("子ノードが存在しません: ghost");
  });

  it("子の parentId が親と一致しなければエラーになる", () => {
    const { data, ids } = validData();
    data.nodes[ids.a].parentId = ids.b;

    expect(() => deserialize(JSON.stringify(data))).toThrow(
      `親子関係が不整合です: ${ids.a}`,
    );
  });

  it("ルートから到達できないノードがあればエラーになる", () => {
    const { data } = validData();
    data.nodes.orphan = {
      id: "orphan",
      kind: "branch",
      text: "孤立",
      parentId: null,
      childIds: [],
      position: { x: 0, y: 0 },
    };

    expect(() => deserialize(JSON.stringify(data))).toThrow("到達できないノードがあります: orphan");
  });

  it.each([["null", null], ["配列", []], ["文字列", "x"]])(
    "ノードの値が不正（%s）な場合はエラーになる",
    (_label, value) => {
      const { data, ids } = validData();
      data.nodes[ids.a] = value;

      expect(() => deserialize(JSON.stringify(data))).toThrow(
        `ノードの形式が不正です: ${ids.a}`,
      );
    },
  );

  it.each([[null], [{ x: 1 }], [{ x: "1", y: 2 }]])(
    "position が不正（%j）な場合はエラーになる",
    (position) => {
      const { data, ids } = validData();
      data.nodes[ids.a].position = position;

      expect(() => deserialize(JSON.stringify(data))).toThrow(
        `ノードの形式が不正です: ${ids.a}`,
      );
    },
  );

  it("子ノードの childIds が重複していても復元できる", () => {
    const { data, ids } = validData();
    data.nodes[ids.root].childIds.push(ids.a);

    expect(deserialize(JSON.stringify(data)).nodes[ids.root].childIds).toHaveLength(3);
  });
});
