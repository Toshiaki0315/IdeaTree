import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { createMindMap } from "./mindmap";
import { MAX_IMAGE_BYTES, isImageDataUrl, setNodeImage } from "./nodeImage";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

function buildMap() {
  const base = createMindMap("root");
  const a = addChild(base, base.rootId, "a");
  const b = addChild(a.map, base.rootId, "b");
  return { map: b.map, ids: { root: base.rootId, a: a.nodeId, b: b.nodeId } };
}

describe("isImageDataUrl（画像のデータURLの検証）", () => {
  it.each([
    ["PNG", PNG],
    ["JPEG", "data:image/jpeg;base64,/9j/4AAQSkZJRg=="],
    ["GIF", "data:image/gif;base64,R0lGODlhAQABAAAAACw="],
    ["WebP", "data:image/webp;base64,UklGRhoAAABXRUJQVlA4"],
  ])("%s の base64 のデータURLは有効", (_name, url) => {
    expect(isImageDataUrl(url)).toBe(true);
  });

  it.each([
    ["SVG（スクリプトを含められるため）", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="],
    ["画像でない種類", "data:text/html;base64,PGgxPg=="],
    ["base64 でない", "data:image/png,rawdata"],
    ["データがない", "data:image/png;base64,"],
    ["base64 以外の文字を含む", "data:image/png;base64,abc def"],
    ["印がない文字列", "iVBORw0KGgo="],
    ["外部のURL", "https://example.com/a.png"],
    ["スクリプト", "javascript:alert(1)"],
    ["空文字列", ""],
    ["文字列でない値", 123],
    ["null", null],
  ])("%s は無効", (_name, value) => {
    expect(isImageDataUrl(value)).toBe(false);
  });

  it("上限（MAX_IMAGE_BYTES）ちょうどのデータは有効で、超えると無効", () => {
    const payloadFor = (bytes: number) => "A".repeat(Math.ceil((bytes * 4) / 3));

    expect(isImageDataUrl(`data:image/png;base64,${payloadFor(MAX_IMAGE_BYTES)}`)).toBe(true);
    expect(isImageDataUrl(`data:image/png;base64,${payloadFor(MAX_IMAGE_BYTES + 3)}`)).toBe(false);
  });
});

describe("setNodeImage（ノードの画像の設定）", () => {
  it("指定したノードに画像を設定し、他のノードは変えない", () => {
    const { map, ids } = buildMap();

    const next = setNodeImage(map, ids.a, PNG);

    expect(next.nodes[ids.a].image).toBe(PNG);
    expect(next.nodes[ids.b]).toBe(map.nodes[ids.b]);
  });

  it("中心ノード（セントラルイメージ）にも設定できる", () => {
    const { map, ids } = buildMap();

    expect(setNodeImage(map, ids.root, PNG).nodes[ids.root].image).toBe(PNG);
  });

  it("別の画像で置き換えられ、undefined で外せる（外すと、image 自体がなくなる）", () => {
    const { map, ids } = buildMap();
    const other = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
    const withPng = setNodeImage(map, ids.a, PNG);

    expect(setNodeImage(withPng, ids.a, other).nodes[ids.a].image).toBe(other);

    const removed = setNodeImage(withPng, ids.a, undefined);
    expect("image" in removed.nodes[ids.a]).toBe(false);
  });

  it("変化がないとき（同じ画像、画像がないのに外す）は、同じマップをそのまま返す", () => {
    const { map, ids } = buildMap();
    const withPng = setNodeImage(map, ids.a, PNG);

    expect(setNodeImage(withPng, ids.a, PNG)).toBe(withPng);
    expect(setNodeImage(map, ids.a, undefined)).toBe(map);
  });

  it("画像以外のノードの内容（テキスト・子など）は、そのまま保たれる", () => {
    const { map, ids } = buildMap();

    const next = setNodeImage(map, ids.a, PNG);

    expect({ ...next.nodes[ids.a], image: undefined }).toEqual({
      ...map.nodes[ids.a],
      image: undefined,
    });
  });

  it("不正なデータURLは、日本語のエラーになり、設定されない", () => {
    const { map, ids } = buildMap();

    expect(() => setNodeImage(map, ids.a, "data:image/svg+xml;base64,PHN2Zz4=")).toThrow(
      "画像の形式が不正です（PNG・JPEG・GIF・WebP のみ）",
    );
    expect(map.nodes[ids.a].image).toBeUndefined();
  });

  it("大きすぎる画像は、上限を示すエラーになる", () => {
    const { map, ids } = buildMap();
    const huge = `data:image/png;base64,${"A".repeat(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8)}`;

    expect(() => setNodeImage(map, ids.a, huge)).toThrow("画像が大きすぎます（上限 2 MB）");
  });

  it("存在しないノードIDを指定するとエラーになる", () => {
    const { map } = buildMap();

    expect(() => setNodeImage(map, "missing", PNG)).toThrow("ノードが存在しません: missing");
  });

  it("元のマインドマップを変更しない（イミュータブル）", () => {
    const { map, ids } = buildMap();
    const before = structuredClone(map);

    setNodeImage(map, ids.a, PNG);

    expect(map).toEqual(before);
  });
});
