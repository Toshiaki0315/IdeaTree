import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { addSibling } from "./addSibling";
import { toggleCollapse } from "./collapse";
import { ICON_PRESETS, setNodeIcon } from "./nodeIcon";
import { MAX_IMAGE_BYTES } from "./nodeImage";
import { setNodeImage } from "./nodeImage";
import { setNodeStyle } from "./nodeStyle";
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

  it("同じ子が、childIds に重複していればエラーになる", () => {
    const { data, ids } = validData();
    data.nodes[ids.root].childIds.push(ids.a);

    expect(() => deserialize(JSON.stringify(data))).toThrow(`子ノードが重複しています: ${ids.a}`);
  });

  it("同じ子が、別の親の childIds にもあればエラーになる", () => {
    const { data, ids } = validData();
    data.nodes[ids.a].childIds.push(ids.b);

    expect(() => deserialize(JSON.stringify(data))).toThrow(`親子関係が不整合です: ${ids.b}`);
  });

  describe("ノードの種類（kind）の整合", () => {
    it("ルートが中心ノード（central）でなければエラーになる", () => {
      const { data, ids } = validData();
      data.nodes[ids.root].kind = "branch";

      expect(() => deserialize(JSON.stringify(data))).toThrow(`ノードの種類が不整合です: ${ids.root}`);
    });

    it("ルート以外が中心ノード（central）ならエラーになる", () => {
      const { data, ids } = validData();
      data.nodes[ids.a].kind = "central";

      expect(() => deserialize(JSON.stringify(data))).toThrow(`ノードの種類が不整合です: ${ids.a}`);
    });
  });

  it.each([["1e999"], ["-1e999"]])("座標が有限の数でなければ（%s）エラーになる", (huge) => {
    const { data, ids } = validData();
    const json = JSON.stringify(data).replace(
      new RegExp(`("id":"${ids.a}".*?"position":\\{"x":)[^,]+`),
      `$1${huge}`,
    );

    expect(() => deserialize(json)).toThrow(`ノードの形式が不正です: ${ids.a}`);
  });

  describe("collapsed（折りたたみ状態）", () => {
    it("折りたたみ状態を、保存して読み込んでも保てる（往復）", () => {
      const { data, ids } = validData();
      const base = deserialize(JSON.stringify(data));
      const folded = toggleCollapse(base, ids.root);

      const restored = deserialize(serialize(folded));

      expect(restored.nodes[ids.root].collapsed).toBe(true);
      expect(restored).toEqual(folded);
    });

    it("collapsed がないノード（従来のファイル）も、そのまま読み込める", () => {
      const { data, ids } = validData();
      expect("collapsed" in data.nodes[ids.a]).toBe(false);

      expect(deserialize(JSON.stringify(data)).nodes[ids.a].collapsed).toBeUndefined();
    });

    it.each([[true], [false]])("真偽値（%s）は、そのまま読み込める", (value) => {
      const { data, ids } = validData();
      data.nodes[ids.root].collapsed = value;

      expect(deserialize(JSON.stringify(data)).nodes[ids.root].collapsed).toBe(value);
    });

    it("子を持たないノードに collapsed があっても、エラーにせず読み込める", () => {
      const { data, ids } = validData();
      data.nodes[ids.b].collapsed = true;

      expect(deserialize(JSON.stringify(data)).nodes[ids.b].collapsed).toBe(true);
    });

    it.each([[1], ["true"], [null], [{}], [[]]])(
      "真偽値でない値（%j）はエラーになる",
      (value) => {
        const { data, ids } = validData();
        data.nodes[ids.a].collapsed = value;

        expect(() => deserialize(JSON.stringify(data))).toThrow(
          `ノードの形式が不正です: ${ids.a}`,
        );
      },
    );
  });

  describe("style（ノードのスタイル）", () => {
    const fullStyle = {
      bold: true,
      italic: false,
      color: "#1A7FD1",
      fontFamily: "Hiragino Mincho ProN",
      fontSize: 24,
      imageScale: 1.5,
    };

    it("スタイルを、保存して読み込んでも保てる（往復）", () => {
      const { data, ids } = validData();
      const base = deserialize(JSON.stringify(data));
      const styled = setNodeStyle(base, ids.a, { bold: true, color: "#112233", fontSize: 30 });

      const restored = deserialize(serialize(styled));

      expect(restored.nodes[ids.a].style).toEqual({ bold: true, color: "#112233", fontSize: 30 });
      expect(restored).toEqual(styled);
    });

    it("style がないノード（従来のファイル）も、そのまま読み込める", () => {
      const { data, ids } = validData();
      expect("style" in data.nodes[ids.a]).toBe(false);

      expect(deserialize(JSON.stringify(data)).nodes[ids.a].style).toBeUndefined();
    });

    it("すべての項目を持つスタイル、空のスタイルを読み込める", () => {
      const { data, ids } = validData();
      data.nodes[ids.a].style = fullStyle;
      data.nodes[ids.b].style = {};

      const map = deserialize(JSON.stringify(data));

      expect(map.nodes[ids.a].style).toEqual(fullStyle);
      expect(map.nodes[ids.b].style).toEqual({});
    });

    it.each([[8], [200], [12.5]])("範囲内の文字サイズ（%s）を読み込める", (fontSize) => {
      const { data, ids } = validData();
      data.nodes[ids.a].style = { fontSize };

      expect(deserialize(JSON.stringify(data)).nodes[ids.a].style).toEqual({ fontSize });
    });

    it.each([
      ["null", null],
      ["配列", []],
      ["文字列", "bold"],
      ["数値", 1],
      ["真偽値", true],
    ])("style がオブジェクトでない（%s）場合はエラーになる", (_label, style) => {
      const { data, ids } = validData();
      data.nodes[ids.a].style = style;

      expect(() => deserialize(JSON.stringify(data))).toThrow(`ノードの形式が不正です: ${ids.a}`);
    });

    it.each([
      ["bold が真偽値でない", { bold: "yes" }],
      ["italic が真偽値でない", { italic: 1 }],
      ["color が文字列でない", { color: 123 }],
      ["color が #RRGGBB でない", { color: "red" }],
      ["color が短縮形", { color: "#FFF" }],
      ["fontFamily が文字列でない", { fontFamily: 5 }],
      ["fontFamily が空", { fontFamily: "" }],
      ["fontFamily が空白のみ", { fontFamily: "   " }],
      ["fontSize が数値でない", { fontSize: "20" }],
      ["fontSize が null", { fontSize: null }],
      ["fontSize が小さすぎる", { fontSize: 7 }],
      ["fontSize が大きすぎる", { fontSize: 201 }],
      ["imageScale が小さすぎる", { imageScale: 0.1 }],
      ["imageScale が大きすぎる", { imageScale: 5 }],
      ["imageScale が数値でない", { imageScale: "2" }],
      ["未知の項目を含む", { underline: true }],
    ])("不正なスタイル（%s）はエラーになる", (_label, style) => {
      const { data, ids } = validData();
      data.nodes[ids.a].style = style;

      expect(() => deserialize(JSON.stringify(data))).toThrow(`ノードの形式が不正です: ${ids.a}`);
    });
  });
});

describe("deserialize（branchColor: メインブランチの色）", () => {
  it("branchColor を、保存して読み込んでも保てる（往復）", () => {
    const { data, ids } = validData();
    data.nodes[ids.a].branchColor = "#123456";
    const map = deserialize(JSON.stringify(data));

    expect(map.nodes[ids.a].branchColor).toBe("#123456");
    expect(deserialize(serialize(map))).toEqual(map);
  });

  it("branchColor がないノード（従来のファイル）も、そのまま読み込める", () => {
    const { data, ids } = validData();
    delete data.nodes[ids.a].branchColor;

    expect(deserialize(JSON.stringify(data)).nodes[ids.a].branchColor).toBeUndefined();
  });

  it.each([[123], ["red"], ["#FFF"], ["#GG0000"], [null], [{}]])(
    "不正な branchColor（%j）はエラーになる",
    (value) => {
      const { data, ids } = validData();
      data.nodes[ids.a].branchColor = value;

      expect(() => deserialize(JSON.stringify(data))).toThrow(`ノードの形式が不正です: ${ids.a}`);
    },
  );
});

describe("deserialize（image: ノードの画像）", () => {
  const PNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

  it("画像を、保存して読み込んでも保てる（往復）", () => {
    const { data, ids } = validData();
    const base = deserialize(JSON.stringify(data));
    const withImage = setNodeImage(setNodeImage(base, ids.root, PNG), ids.a, PNG);

    const restored = deserialize(serialize(withImage));

    expect(restored.nodes[ids.root].image).toBe(PNG);
    expect(restored).toEqual(withImage);
  });

  it("image がないノード（従来のファイル）も、そのまま読み込める", () => {
    const { data, ids } = validData();

    expect(deserialize(JSON.stringify(data)).nodes[ids.a].image).toBeUndefined();
  });

  it.each([
    ["SVG", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="],
    ["外部のURL", "https://example.com/a.png"],
    ["スクリプト", "javascript:alert(1)"],
    ["base64 でない", "data:image/png,raw"],
    ["文字列でない", 123],
    ["null", null],
  ])("不正な image（%s）はエラーになる", (_name, value) => {
    const { data, ids } = validData();
    data.nodes[ids.a].image = value;

    expect(() => deserialize(JSON.stringify(data))).toThrow(`ノードの形式が不正です: ${ids.a}`);
  });

  it("大きすぎる画像を含むファイルは、エラーになる", () => {
    const { data, ids } = validData();
    data.nodes[ids.a].image = `data:image/png;base64,${"A".repeat(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8)}`;

    expect(() => deserialize(JSON.stringify(data))).toThrow(`ノードの形式が不正です: ${ids.a}`);
  });
});

describe("deserialize（icon: ノードのアイコン）", () => {
  const star = ICON_PRESETS[0].value;

  it("アイコンを、保存して読み込んでも保てる（往復）", () => {
    const { data, ids } = validData();
    const base = deserialize(JSON.stringify(data));
    const withIcon = setNodeIcon(setNodeIcon(base, ids.root, star), ids.a, ICON_PRESETS[1].value);

    const restored = deserialize(serialize(withIcon));

    expect(restored.nodes[ids.root].icon).toBe(star);
    expect(restored).toEqual(withIcon);
  });

  it("icon がないノード（従来のファイル）も、そのまま読み込める", () => {
    const { data, ids } = validData();

    expect(deserialize(JSON.stringify(data)).nodes[ids.a].icon).toBeUndefined();
  });

  it.each([["選択肢にない記号", "👍"], ["任意の文字列", "<script>"], ["空文字列", ""], ["数値", 1], ["null", null]])(
    "不正な icon（%s）はエラーになる",
    (_name, value) => {
      const { data, ids } = validData();
      data.nodes[ids.a].icon = value;

      expect(() => deserialize(JSON.stringify(data))).toThrow(`ノードの形式が不正です: ${ids.a}`);
    },
  );

  describe("以前の版の絵文字のアイコン", () => {
    it.each([["⭐", "star"], ["✅", "check"], ["💡", "idea"], ["❤️", "heart"], ["💰", "money"]])(
      "絵文字 %s は、新しいアイコンの識別子 %s に変換して読み込む",
      (emoji, id) => {
        const { data, ids } = validData();
        data.nodes[ids.a].icon = emoji;

        const map = deserialize(JSON.stringify(data));

        expect(map.nodes[ids.a].icon).toBe(id);
      },
    );

    it("変換したあとに保存すると、新しい識別子で保存される", () => {
      const { data, ids } = validData();
      data.nodes[ids.root].icon = "🎯";

      const saved = JSON.parse(serialize(deserialize(JSON.stringify(data))));

      expect(saved.nodes[ids.root].icon).toBe("target");
    });

    it("知らない絵文字は、これまでどおり、エラーになる", () => {
      const { data, ids } = validData();
      data.nodes[ids.a].icon = "👍";

      expect(() => deserialize(JSON.stringify(data))).toThrow(`ノードの形式が不正です: ${ids.a}`);
    });
  });
});

