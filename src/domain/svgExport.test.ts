import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { BRANCH_COLORS } from "./branchColor";
import { layout } from "./layout";
import { createMindMap } from "./mindmap";
import type { MindMap, NodeId } from "./mindmap";
import { exportSvg } from "./svgExport";
import { updateText } from "./updateText";

const SVG_NS = "http://www.w3.org/2000/svg";

function parse(svg: string): Document {
  return new DOMParser().parseFromString(svg, "image/svg+xml");
}

function byNodeId(doc: Document, selector: string, id: NodeId): Element {
  const el = doc.querySelector(`${selector}[data-node-id="${id}"]`);
  if (!el) throw new Error(`${selector} for ${id} not found`);
  return el;
}

/** root ─ a ─ a1 ─ a11 / b の木（レイアウト済み） */
function buildMap() {
  const base = createMindMap("アイデア");
  const a = addChild(base, base.rootId, "企画");
  const b = addChild(a.map, base.rootId, "予算");
  const a1 = addChild(b.map, a.nodeId, "調査");
  const a11 = addChild(a1.map, a1.nodeId, "競合");
  return {
    map: layout(a11.map),
    ids: { root: base.rootId, a: a.nodeId, b: b.nodeId, a1: a1.nodeId, a11: a11.nodeId },
  };
}

function pos(map: MindMap, id: NodeId) {
  return map.nodes[id].position;
}

describe("exportSvg（SVGエクスポート / Cmd+Shift+E）", () => {
  it("名前空間付きの、XMLとして正しいSVG文書を返す", () => {
    const { map } = buildMap();

    const doc = parse(exportSvg(map));

    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.documentElement.localName).toBe("svg");
    expect(doc.documentElement.namespaceURI).toBe(SVG_NS);
  });

  it("viewBox・width・height を持ち、全ノードの位置が余白付きで収まる", () => {
    const { map } = buildMap();

    const svg = parse(exportSvg(map)).documentElement;
    const [minX, minY, width, height] = svg.getAttribute("viewBox")!.split(" ").map(Number);

    expect(Number(svg.getAttribute("width"))).toBe(width);
    expect(Number(svg.getAttribute("height"))).toBe(height);
    for (const node of Object.values(map.nodes)) {
      expect(node.position.x).toBeGreaterThan(minX);
      expect(node.position.x).toBeLessThan(minX + width);
      expect(node.position.y).toBeGreaterThan(minY);
      expect(node.position.y).toBeLessThan(minY + height);
    }
  });

  it("ルートだけのマップでも、正のサイズのSVGを返す", () => {
    const svg = parse(exportSvg(createMindMap("A"))).documentElement;
    const [, , width, height] = svg.getAttribute("viewBox")!.split(" ").map(Number);

    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });

  it("ルート以外のノードごとに、親から子へ向かう1本のブランチ(path)を描く", () => {
    const { map, ids } = buildMap();

    const doc = parse(exportSvg(map));

    expect(doc.querySelectorAll("path")).toHaveLength(Object.keys(map.nodes).length - 1);
    expect(doc.querySelector(`path[data-node-id="${ids.root}"]`)).toBeNull();
  });

  it("ブランチは直線ではなく三次ベジェ曲線で、親の位置から子の位置までを結ぶ", () => {
    const { map, ids } = buildMap();

    const d = byNodeId(parse(exportSvg(map)), "path", ids.a1).getAttribute("d")!;
    const numbers = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const parent = pos(map, ids.a);
    const child = pos(map, ids.a1);

    expect(d).toMatch(/^M[^A-Za-z]+C[^A-Za-z]+$/);
    expect(numbers).toHaveLength(8);
    expect(numbers[0]).toBeCloseTo(parent.x, 1);
    expect(numbers[1]).toBeCloseTo(parent.y, 1);
    expect(numbers[6]).toBeCloseTo(child.x, 1);
    expect(numbers[7]).toBeCloseTo(child.y, 1);
  });

  it("ブランチは塗りつぶさず、メインブランチの色で線を描き、端は丸める", () => {
    const { map, ids } = buildMap();
    const doc = parse(exportSvg(map));

    const main = byNodeId(doc, "path", ids.b);
    expect(main.getAttribute("fill")).toBe("none");
    expect(main.getAttribute("stroke")).toBe(BRANCH_COLORS[1]);
    expect(main.getAttribute("stroke-linecap")).toBe("round");
    // サブブランチはメインブランチの色を引き継ぐ
    expect(byNodeId(doc, "path", ids.a11).getAttribute("stroke")).toBe(BRANCH_COLORS[0]);
  });

  it("中心に近いほど太く、外側ほど細い（深さが増えると線幅が減る）", () => {
    const { map, ids } = buildMap();
    const doc = parse(exportSvg(map));
    const width = (id: NodeId) => Number(byNodeId(doc, "path", id).getAttribute("stroke-width"));

    expect(width(ids.a)).toBeGreaterThan(width(ids.a1));
    expect(width(ids.a1)).toBeGreaterThan(width(ids.a11));
    expect(width(ids.a11)).toBeGreaterThan(0);
  });

  it("ルートはセントラルイメージとして楕円で描き、その位置の中心に置く", () => {
    const { map, ids } = buildMap();

    const ellipse = byNodeId(parse(exportSvg(map)), "ellipse", ids.root);

    expect(Number(ellipse.getAttribute("cx"))).toBeCloseTo(0);
    expect(Number(ellipse.getAttribute("cy"))).toBeCloseTo(0);
    expect(Number(ellipse.getAttribute("rx"))).toBeGreaterThan(0);
    expect(Number(ellipse.getAttribute("ry"))).toBeGreaterThan(0);
  });

  it("すべてのノードのテキストを、ノードの位置に1つずつ描く", () => {
    const { map } = buildMap();

    const doc = parse(exportSvg(map));

    expect(doc.querySelectorAll("text")).toHaveLength(Object.keys(map.nodes).length);
    for (const node of Object.values(map.nodes)) {
      const text = byNodeId(doc, "text", node.id);
      expect(text.textContent).toBe(node.text);
      expect(Number(text.getAttribute("x"))).toBeCloseTo(node.position.x, 1);
    }
  });

  it("テキストにフォントファミリーを指定し、日本語もそのまま出力する", () => {
    const { map } = buildMap();
    const svg = exportSvg(map);

    expect(svg).toContain("企画");
    expect(parse(svg).querySelector("text")!.getAttribute("font-family")).toBeTruthy();
  });

  it("XML特殊文字を含むテキストをエスケープする", () => {
    const base = createMindMap("A");
    const text = `<b>&"'`;
    const map = layout(updateText(base, base.rootId, text));

    const svg = exportSvg(map);
    const doc = parse(svg);

    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.querySelector("text")!.textContent).toBe(text);
    expect(svg).not.toContain("<b>");
  });

  it("ブランチ(線)を先に、ノード(図形・テキスト)を後に描いて、文字が線に隠れない", () => {
    const { map } = buildMap();
    const elements = [...parse(exportSvg(map)).documentElement.querySelectorAll("path, ellipse, text")];
    const lastPath = elements.map((e) => e.localName).lastIndexOf("path");
    const firstOther = elements.findIndex((e) => e.localName !== "path");

    expect(lastPath).toBeLessThan(firstOther);
  });

  it("背景を白で塗り、書き出した画像が透過で見えにくくならない", () => {
    const { map } = buildMap();

    const rect = parse(exportSvg(map)).querySelector("rect[data-role='background']");

    expect(rect).not.toBeNull();
    expect(rect!.getAttribute("fill")).toBe("#FFFFFF");
  });

  it("同じマップからは常に同じSVGを返し、元のマップを変更しない", () => {
    const { map } = buildMap();
    const before = structuredClone(map);

    expect(exportSvg(map)).toBe(exportSvg(map));
    expect(map).toEqual(before);
  });
});
