import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { BRANCH_COLORS } from "./branchColor";
import { toggleCollapse } from "./collapse";
import { layout } from "./layout";
import { createMindMap } from "./mindmap";
import type { MindMap, NodeId } from "./mindmap";
import { estimateTextWidth } from "./hitArea";
import { ICON_PRESETS, setNodeIcon } from "./nodeIcon";
import { setNodeImage } from "./nodeImage";
import { setNodeStyle } from "./nodeStyle";
import { exportSvg, labelPosition } from "./svgExport";
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

  it("すべてのノードのテキストを1つずつ描く。サブブランチ上のテキストは枝の中点に、メインブランチは、中心の外側の枝の真ん中に置く", () => {
    const { map } = buildMap();

    const doc = parse(exportSvg(map));

    expect(doc.querySelectorAll("text")).toHaveLength(Object.keys(map.nodes).length);
    for (const node of Object.values(map.nodes)) {
      const text = byNodeId(doc, "text", node.id);
      const anchor =
        node.parentId === null
          ? node.position
          : node.parentId === map.rootId
            ? labelPosition(map, node)
            : {
                x: (pos(map, node.parentId).x + node.position.x) / 2,
                y: (pos(map, node.parentId).y + node.position.y) / 2,
              };
      expect(text.textContent).toBe(node.text);
      expect(Number(text.getAttribute("x"))).toBeCloseTo(anchor.x, 1);
      expect(Number(text.getAttribute("y"))).toBeCloseTo(anchor.y, 1);
      expect(text.getAttribute("text-anchor")).toBe("middle");
      expect(text.getAttribute("dominant-baseline")).toBe("central");
    }
  });

  it("枝の上でも読めるよう、ブランチのテキストに白い縁取り（ハロー）を付ける", () => {
    const { map, ids } = buildMap();

    const text = byNodeId(parse(exportSvg(map)), "text", ids.a1);

    expect(text.getAttribute("stroke")).toBe("#FFFFFF");
    expect(text.getAttribute("paint-order")).toBe("stroke");
    expect(Number(text.getAttribute("stroke-width"))).toBeGreaterThan(0);
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

  describe("折りたたみへの対応", () => {
    it("折りたたまれたノードの子孫は、ブランチもテキストも出力しない", () => {
      const { map, ids } = buildMap();

      const doc = parse(exportSvg(toggleCollapse(map, ids.a)));

      expect(doc.querySelector(`path[data-node-id="${ids.a1}"]`)).toBeNull();
      expect(doc.querySelector(`text[data-node-id="${ids.a1}"]`)).toBeNull();
      expect(doc.querySelector(`path[data-node-id="${ids.a11}"]`)).toBeNull();
      expect(doc.querySelector(`text[data-node-id="${ids.a11}"]`)).toBeNull();
      // 表示されるのは 中心・a・b の3ノード（ブランチは a と b の2本）
      expect(doc.querySelectorAll("text")).toHaveLength(3);
      expect(doc.querySelectorAll("path")).toHaveLength(2);
    });

    it("折りたたまれたノード自身とそのブランチは出力し、ラベルの末尾に「…」を付ける", () => {
      const { map, ids } = buildMap();

      const doc = parse(exportSvg(toggleCollapse(map, ids.a)));

      expect(byNodeId(doc, "path", ids.a)).toBeTruthy();
      expect(byNodeId(doc, "text", ids.a).textContent).toBe("企画…");
    });

    it("折りたたまれていないノードのラベルには、「…」を付けない", () => {
      const { map, ids } = buildMap();

      const doc = parse(exportSvg(toggleCollapse(map, ids.a)));

      expect(byNodeId(doc, "text", ids.b).textContent).toBe("予算");
      expect(byNodeId(doc, "text", ids.root).textContent).toBe("アイデア");
    });

    it("子を持たないノードに残った折りたたみ状態では、「…」を付けない", () => {
      const { map, ids } = buildMap();
      const stale: MindMap = {
        ...map,
        nodes: { ...map.nodes, [ids.b]: { ...map.nodes[ids.b], collapsed: true } },
      };

      expect(byNodeId(parse(exportSvg(stale)), "text", ids.b).textContent).toBe("予算");
    });

    it("展開すると、すべてのノードが再び出力される", () => {
      const { map, ids } = buildMap();
      const reopened = toggleCollapse(toggleCollapse(map, ids.a), ids.a);

      const doc = parse(exportSvg(reopened));

      expect(doc.querySelectorAll("text")).toHaveLength(Object.keys(map.nodes).length);
      expect(byNodeId(doc, "text", ids.a).textContent).toBe("企画");
    });

    it("中心ノードを折りたたむと、中心ノードだけを出力する", () => {
      const { map, ids } = buildMap();

      const doc = parse(exportSvg(toggleCollapse(map, ids.root)));

      expect(doc.querySelectorAll("path")).toHaveLength(0);
      expect(doc.querySelectorAll("text")).toHaveLength(1);
      expect(byNodeId(doc, "text", ids.root).textContent).toBe("アイデア…");
    });

    it("「…」を付けても、XML特殊文字はエスケープされ、正しいSVGのままである", () => {
      const { map, ids } = buildMap();
      const renamed = toggleCollapse(updateText(map, ids.a, "A&B<"), ids.a);

      const doc = parse(exportSvg(renamed));

      expect(doc.querySelector("parsererror")).toBeNull();
      expect(byNodeId(doc, "text", ids.a).textContent).toBe("A&B<…");
    });

    it("表示範囲（viewBox）は、表示されるノードだけから計算する", () => {
      const { map, ids } = buildMap();
      const far: MindMap = {
        ...map,
        nodes: {
          ...map.nodes,
          [ids.a1]: { ...map.nodes[ids.a1], position: { x: 5000, y: 5000 } },
          [ids.a11]: { ...map.nodes[ids.a11], position: { x: -5000, y: -5000 } },
        },
      };

      const viewBox = (m: MindMap) =>
        parse(exportSvg(m)).documentElement.getAttribute("viewBox")!.split(" ").map(Number);
      const [, , wide] = viewBox(far);
      const [, , narrow] = viewBox(toggleCollapse(far, ids.a));

      expect(wide).toBeGreaterThan(9000);
      expect(narrow).toBeLessThan(2000);
    });

    it("折りたたまれたブランチの線の色と太さは、折りたたまれていないときと同じ", () => {
      const { map, ids } = buildMap();

      const normal = byNodeId(parse(exportSvg(map)), "path", ids.a);
      const folded = byNodeId(parse(exportSvg(toggleCollapse(map, ids.a))), "path", ids.a);

      expect(folded.getAttribute("stroke")).toBe(normal.getAttribute("stroke"));
      expect(folded.getAttribute("stroke-width")).toBe(normal.getAttribute("stroke-width"));
    });
  });

  describe("ノードのスタイルへの対応", () => {
    const text = (map: MindMap, id: NodeId) => byNodeId(parse(exportSvg(map)), "text", id);
    const path = (map: MindMap, id: NodeId) => byNodeId(parse(exportSvg(map)), "path", id);

    it("スタイルがないノードは、標準の太さ・字体で、既定のサイズ（中心24・メイン20・それ以降16）になる", () => {
      const { map, ids } = buildMap();

      for (const id of [ids.root, ids.a, ids.a1]) {
        expect(text(map, id).getAttribute("font-weight")).toBe("normal");
        expect(text(map, id).getAttribute("font-style")).toBe("normal");
      }
      expect(text(map, ids.root).getAttribute("font-size")).toBe("24");
      expect(text(map, ids.a).getAttribute("font-size")).toBe("20");
      expect(text(map, ids.a1).getAttribute("font-size")).toBe("16");
    });

    it("太字・斜体を指定したノードのテキストに、反映される（他のノードは変わらない）", () => {
      const { map, ids } = buildMap();
      const styled = setNodeStyle(setNodeStyle(map, ids.a, { bold: true }), ids.b, { italic: true });

      expect(text(styled, ids.a).getAttribute("font-weight")).toBe("bold");
      expect(text(styled, ids.a).getAttribute("font-style")).toBe("normal");
      expect(text(styled, ids.b).getAttribute("font-style")).toBe("italic");
      expect(text(styled, ids.b).getAttribute("font-weight")).toBe("normal");
      expect(text(styled, ids.a1).getAttribute("font-weight")).toBe("normal");
    });

    it("太字・斜体は、中心ノードにも反映される", () => {
      const { map, ids } = buildMap();
      const styled = setNodeStyle(map, ids.root, { bold: true, italic: true });

      expect(text(styled, ids.root).getAttribute("font-weight")).toBe("bold");
      expect(text(styled, ids.root).getAttribute("font-style")).toBe("italic");
    });

    it("文字サイズの指定は、既定のサイズを置き換える", () => {
      const { map, ids } = buildMap();
      const styled = setNodeStyle(setNodeStyle(map, ids.a1, { fontSize: 40 }), ids.root, {
        fontSize: 30,
      });

      expect(text(styled, ids.a1).getAttribute("font-size")).toBe("40");
      expect(text(styled, ids.root).getAttribute("font-size")).toBe("30");
      expect(text(styled, ids.a).getAttribute("font-size")).toBe("20");
    });

    it("フォントの指定は先頭に置かれ、既定のフォントが代替として続く", () => {
      const { map, ids } = buildMap();
      const styled = setNodeStyle(map, ids.a, { fontFamily: "Hiragino Mincho ProN" });

      const family = text(styled, ids.a).getAttribute("font-family")!;
      const defaultFamily = text(map, ids.a).getAttribute("font-family")!;

      expect(family.startsWith("'Hiragino Mincho ProN', ")).toBe(true);
      expect(family.endsWith(defaultFamily)).toBe(true);
      expect(text(styled, ids.b).getAttribute("font-family")).toBe(defaultFamily);
    });

    it("フォント名に特殊文字が含まれていても、SVGの属性を壊さない", () => {
      const { map, ids } = buildMap();
      const styled = setNodeStyle(map, ids.a, { fontFamily: `Evil" onload="x'<&>` });

      const doc = parse(exportSvg(styled));

      expect(doc.querySelector("parsererror")).toBeNull();
      expect(byNodeId(doc, "text", ids.a).getAttribute("onload")).toBeNull();
      expect(byNodeId(doc, "text", ids.a).textContent).toBe("企画");
    });

    it("色の指定は、そのノードのテキストと、親から伸びる枝に反映される", () => {
      const { map, ids } = buildMap();
      const styled = setNodeStyle(map, ids.a1, { color: "#123456" });

      expect(text(styled, ids.a1).getAttribute("fill")).toBe("#123456");
      expect(path(styled, ids.a1).getAttribute("stroke")).toBe("#123456");
    });

    it("色の指定は、子孫や兄弟には引き継がれず、メインブランチの色のまま", () => {
      const { map, ids } = buildMap();
      const styled = setNodeStyle(map, ids.a, { color: "#123456" });

      expect(path(styled, ids.a).getAttribute("stroke")).toBe("#123456");
      expect(path(styled, ids.a1).getAttribute("stroke")).toBe(BRANCH_COLORS[0]);
      expect(text(styled, ids.a1).getAttribute("fill")).toBe(BRANCH_COLORS[0]);
      expect(path(styled, ids.b).getAttribute("stroke")).toBe(BRANCH_COLORS[1]);
    });

    it("中心ノードの色の指定は、テキストと楕円の枠線に反映される", () => {
      const { map, ids } = buildMap();
      const styled = setNodeStyle(map, ids.root, { color: "#AA0000" });
      const doc = parse(exportSvg(styled));

      expect(byNodeId(doc, "text", ids.root).getAttribute("fill")).toBe("#AA0000");
      expect(byNodeId(doc, "ellipse", ids.root).getAttribute("stroke")).toBe("#AA0000");
    });

    it("色を指定しても、枝の太さや、文字の縁取り（白）は変わらない", () => {
      const { map, ids } = buildMap();
      const styled = setNodeStyle(map, ids.a, { color: "#123456" });

      expect(path(styled, ids.a).getAttribute("stroke-width")).toBe(
        path(map, ids.a).getAttribute("stroke-width"),
      );
      expect(text(styled, ids.a).getAttribute("stroke")).toBe("#FFFFFF");
    });

    it("折りたたみの印「…」と、スタイルは同時に使える", () => {
      const { map, ids } = buildMap();
      const styled = toggleCollapse(setNodeStyle(map, ids.a, { bold: true }), ids.a);

      expect(text(styled, ids.a).textContent).toBe("企画…");
      expect(text(styled, ids.a).getAttribute("font-weight")).toBe("bold");
    });

    it("スタイルを設定しても、元のマインドマップを変更しない", () => {
      const { map, ids } = buildMap();
      const styled = setNodeStyle(map, ids.a, { bold: true, color: "#123456", fontSize: 30 });
      const before = structuredClone(styled);

      exportSvg(styled);

      expect(styled).toEqual(before);
    });
  });

  describe("ノードの画像への対応", () => {
    const PNG =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
    const image = (map: MindMap, id: NodeId) => parse(exportSvg(map)).querySelector(`image[data-node-id="${id}"]`);
    const num = (el: Element, name: string) => Number(el.getAttribute(name));

    it("画像のないノードには、画像の要素を出力しない（中心ノードは、従来どおり楕円）", () => {
      const { map, ids } = buildMap();
      const doc = parse(exportSvg(map));

      expect(doc.querySelectorAll("image")).toHaveLength(0);
      expect(doc.querySelector(`ellipse[data-node-id="${ids.root}"]`)).not.toBeNull();
    });

    it("中心ノードの画像（セントラルイメージ）は、楕円の代わりに、中心に描かれ、テキストは画像の下に置かれる", () => {
      const { map, ids } = buildMap();
      const withImage = setNodeImage(map, ids.root, PNG);
      const doc = parse(exportSvg(withImage));

      const el = doc.querySelector(`image[data-node-id="${ids.root}"]`)!;
      expect(el.getAttribute("href")).toBe(PNG);
      expect(el.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
      expect(num(el, "x") + num(el, "width") / 2).toBeCloseTo(pos(map, ids.root).x);
      expect(num(el, "y") + num(el, "height") / 2).toBeCloseTo(pos(map, ids.root).y);
      expect(doc.querySelector(`ellipse[data-node-id="${ids.root}"]`)).toBeNull();
      const text = byNodeId(doc, "text", ids.root);
      expect(Number(text.getAttribute("y"))).toBeGreaterThan(num(el, "y") + num(el, "height") - 1);
    });

    it("メインブランチなどの画像は、ラベルの上に、ラベルと同じ水平位置で描かれる", () => {
      const { map, ids } = buildMap();
      const withImage = setNodeImage(map, ids.a1, PNG);
      const doc = parse(exportSvg(withImage));

      const el = doc.querySelector(`image[data-node-id="${ids.a1}"]`)!;
      const text = byNodeId(doc, "text", ids.a1);
      expect(el.getAttribute("href")).toBe(PNG);
      expect(num(el, "x") + num(el, "width") / 2).toBeCloseTo(Number(text.getAttribute("x")), 1);
      expect(num(el, "y") + num(el, "height")).toBeLessThanOrEqual(Number(text.getAttribute("y")));
    });

    it("画像は、枝の上、テキストの下に重ねて描かれる（文字が隠れない）", () => {
      const { map, ids } = buildMap();
      const withImage = setNodeImage(setNodeImage(map, ids.root, PNG), ids.a, PNG);
      const names = [...parse(exportSvg(withImage)).documentElement.querySelectorAll("path, image, text")].map(
        (e) => e.localName,
      );

      expect(names.lastIndexOf("path")).toBeLessThan(names.indexOf("image"));
      expect(names.lastIndexOf("image")).toBeLessThan(names.indexOf("text"));
    });

    it("折りたたまれて見えないノードの画像は、出力しない", () => {
      const { map, ids } = buildMap();
      const hidden = toggleCollapse(setNodeImage(map, ids.a1, PNG), ids.a);

      expect(image(hidden, ids.a1)).toBeNull();
    });

    it("画像を外すと、再び、中心ノードは楕円になる", () => {
      const { map, ids } = buildMap();
      const removed = setNodeImage(setNodeImage(map, ids.root, PNG), ids.root, undefined);

      expect(image(removed, ids.root)).toBeNull();
      expect(parse(exportSvg(removed)).querySelector(`ellipse[data-node-id="${ids.root}"]`)).not.toBeNull();
    });
  });

  describe("ノードのアイコンへの対応", () => {
    const star = ICON_PRESETS[0];
    const heart = ICON_PRESETS[8];
    const icon = (map: MindMap, id: NodeId) =>
      parse(exportSvg(map)).querySelector(`g[data-icon-for="${id}"]`);
    /** アイコンの位置と大きさ（transform="translate(x y) scale(k)" から、24×24 の絵の左上と、1辺の長さ） */
    function placement(el: Element) {
      const m = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/.exec(el.getAttribute("transform")!)!;
      const [x, y, k] = [Number(m[1]), Number(m[2]), Number(m[3])];
      return { x, y, size: k * 24 };
    }

    it("アイコンのないノードには、アイコンの図形を出力しない", () => {
      const { map } = buildMap();

      expect(parse(exportSvg(map)).querySelectorAll("[data-icon-for]")).toHaveLength(0);
    });

    it("アイコンは、文字ではなく、オリジナルの図形（パス）として描かれ、識別子を持つ", () => {
      const { map, ids } = buildMap();
      const el = icon(setNodeIcon(map, ids.a1, star.value), ids.a1)!;

      expect(el.localName).toBe("g");
      expect(el.getAttribute("data-icon")).toBe(star.value);
      expect(el.textContent).toBe("");
      const paths = [...el.querySelectorAll("path")];
      expect(paths.map((p) => p.getAttribute("d"))).toEqual(star.shapes.map((sh) => sh.d));
      expect(paths[0].getAttribute("fill")).toBe(star.shapes[0].fill);
      expect(paths[0].getAttribute("stroke")).toBe(star.shapes[0].stroke);
      expect(paths[0].getAttribute("stroke-linecap")).toBe("round");
      expect(paths[0].getAttribute("stroke-linejoin")).toBe("round");
    });

    it("すべてのアイコンが、それぞれの図形の数だけ、パスとして出力される", () => {
      const { map, ids } = buildMap();

      for (const preset of ICON_PRESETS) {
        const el = icon(setNodeIcon(map, ids.a1, preset.value), ids.a1)!;
        expect(el.querySelectorAll("path"), preset.name).toHaveLength(preset.shapes.length);
      }
    });

    it("塗りや線を指定していない図形は、塗りなし・線なしになる（意図しない黒にならない）", () => {
      const { map, ids } = buildMap();
      const target = ICON_PRESETS.find((p) => p.value === "target")!; // 線の指定がない
      const check = ICON_PRESETS.find((p) => p.value === "check")!; // 塗りの指定がない図形がある

      const targetPaths = [...icon(setNodeIcon(map, ids.a1, target.value), ids.a1)!.querySelectorAll("path")];
      const checkPaths = [...icon(setNodeIcon(map, ids.a1, check.value), ids.a1)!.querySelectorAll("path")];

      expect(targetPaths.every((p) => p.getAttribute("stroke") === "none")).toBe(true);
      expect(checkPaths[1].getAttribute("fill")).toBe("none");
    });

    it("ブランチのアイコンは、ラベルの左側に、ラベルと同じ高さの中心で、文字の幅を空けて描かれる", () => {
      const { map, ids } = buildMap();
      const doc = parse(exportSvg(setNodeIcon(map, ids.a1, star.value)));

      const box = placement(doc.querySelector(`g[data-icon-for="${ids.a1}"]`)!);
      const label = byNodeId(doc, "text", ids.a1);
      const fontSize = Number(label.getAttribute("font-size"));
      const labelWidth = estimateTextWidth("調査", fontSize);
      expect(box.size).toBeCloseTo(fontSize * 1.1);
      expect(box.x + box.size).toBeCloseTo(Number(label.getAttribute("x")) - labelWidth / 2 - 6, 1);
      expect(box.y + box.size / 2).toBeCloseTo(Number(label.getAttribute("y")), 1);
    });

    it("ラベルのテキストは、アイコンがあっても変わらない", () => {
      const { map, ids } = buildMap();
      const doc = parse(exportSvg(setNodeIcon(map, ids.a1, star.value)));

      expect(byNodeId(doc, "text", ids.a1).textContent).toBe("調査");
    });

    it("文字が大きいほど、アイコンは、大きく、より左に離れて描かれる", () => {
      const { map, ids } = buildMap();
      const small = setNodeIcon(map, ids.a1, star.value);
      const big = setNodeStyle(small, ids.a1, { fontSize: 60 });

      const [a, b] = [placement(icon(small, ids.a1)!), placement(icon(big, ids.a1)!)];

      expect(b.size).toBeGreaterThan(a.size);
      expect(b.x).toBeLessThan(a.x);
    });

    it("中心ノードのアイコンは、楕円の上に、中央揃えで描かれる", () => {
      const { map, ids } = buildMap();
      const doc = parse(exportSvg(setNodeIcon(map, ids.root, heart.value)));

      const box = placement(doc.querySelector(`g[data-icon-for="${ids.root}"]`)!);
      const ellipse = byNodeId(doc, "ellipse", ids.root);
      expect(box.x + box.size / 2).toBeCloseTo(Number(ellipse.getAttribute("cx")));
      expect(box.y + box.size).toBeLessThanOrEqual(
        Number(ellipse.getAttribute("cy")) - Number(ellipse.getAttribute("ry")),
      );
    });

    it("中心ノードに画像があるときは、アイコンは画像の上に描かれる", () => {
      const { map, ids } = buildMap();
      const png =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
      const doc = parse(exportSvg(setNodeIcon(setNodeImage(map, ids.root, png), ids.root, star.value)));

      const box = placement(doc.querySelector(`g[data-icon-for="${ids.root}"]`)!);
      const image = doc.querySelector(`image[data-node-id="${ids.root}"]`)!;
      expect(box.y + box.size).toBeLessThanOrEqual(Number(image.getAttribute("y")));
    });

    it("折りたたまれて見えないノードのアイコンは、出力しない", () => {
      const { map, ids } = buildMap();
      const hidden = toggleCollapse(setNodeIcon(map, ids.a1, star.value), ids.a);

      expect(icon(hidden, ids.a1)).toBeNull();
    });

    it("アイコンは、枝より上の層に描かれる（枝に隠れない）", () => {
      const { map, ids } = buildMap();
      const top = [...parse(exportSvg(setNodeIcon(map, ids.a, star.value))).documentElement.children].map(
        (e) => e.localName,
      );

      expect(top.indexOf("g")).toBeGreaterThan(top.lastIndexOf("path"));
    });

    it("アイコンを外すと、出力されなくなる", () => {
      const { map, ids } = buildMap();

      expect(icon(setNodeIcon(setNodeIcon(map, ids.a, star.value), ids.a, undefined), ids.a)).toBeNull();
    });
  });

  describe("画像の倍率（imageScale）への対応", () => {
    const PNG =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
    const el = (map: MindMap, id: NodeId) =>
      parse(exportSvg(map)).querySelector(`image[data-node-id="${id}"]`)!;
    const num = (e: Element, name: string) => Number(e.getAttribute(name));

    it("倍率を指定すると、画像の枠の幅と高さが、その倍率になる（標準は 1 倍）", () => {
      const { map, ids } = buildMap();
      const normal = setNodeImage(map, ids.a1, PNG);
      const scaled = setNodeStyle(normal, ids.a1, { imageScale: 2 });

      expect(num(el(scaled, ids.a1), "width")).toBeCloseTo(num(el(normal, ids.a1), "width") * 2);
      expect(num(el(scaled, ids.a1), "height")).toBeCloseTo(num(el(normal, ids.a1), "height") * 2);
    });

    it("ブランチの画像は、ラベルの上に、同じ水平位置を中心にして、拡大・縮小される（下端は変わらない）", () => {
      const { map, ids } = buildMap();
      const normal = setNodeImage(map, ids.a1, PNG);
      const scaled = setNodeStyle(normal, ids.a1, { imageScale: 0.5 });

      const [a, b] = [el(normal, ids.a1), el(scaled, ids.a1)];
      expect(num(b, "x") + num(b, "width") / 2).toBeCloseTo(num(a, "x") + num(a, "width") / 2);
      expect(num(b, "y") + num(b, "height")).toBeCloseTo(num(a, "y") + num(a, "height"));
    });

    it("中心ノードの画像は、中心を保って拡大・縮小され、テキストは、画像の下に、位置を合わせて置かれる", () => {
      const { map, ids } = buildMap();
      const scaled = setNodeStyle(setNodeImage(map, ids.root, PNG), ids.root, { imageScale: 2 });
      const doc = parse(exportSvg(scaled));

      const image = doc.querySelector(`image[data-node-id="${ids.root}"]`)!;
      const text = byNodeId(doc, "text", ids.root);
      expect(num(image, "x") + num(image, "width") / 2).toBeCloseTo(0);
      expect(num(image, "y") + num(image, "height") / 2).toBeCloseTo(0);
      expect(num(image, "width")).toBeCloseTo(320);
      expect(Number(text.getAttribute("y"))).toBeGreaterThan(num(image, "y") + num(image, "height"));
    });

    it("中心ノードのアイコンは、拡大した画像の上に描かれる", () => {
      const { map, ids } = buildMap();
      const scaled = setNodeStyle(setNodeImage(map, ids.root, PNG), ids.root, { imageScale: 2 });
      const doc = parse(exportSvg(setNodeIcon(scaled, ids.root, ICON_PRESETS[0].value)));

      const icon = doc.querySelector(`g[data-icon-for="${ids.root}"]`)!;
      const image = doc.querySelector(`image[data-node-id="${ids.root}"]`)!;
      const m = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/.exec(icon.getAttribute("transform")!)!;
      expect(Number(m[2]) + Number(m[3]) * 24).toBeLessThanOrEqual(num(image, "y"));
    });
  });
});

describe("labelPosition（ブランチのラベルを置く位置）", () => {
  /** 中心ノードを原点に置き、メインブランチを、指定した位置に置いたマップ（レイアウトは使わない） */
  function mapWithMainAt(x: number, y: number) {
    const base = createMindMap("root");
    const a = addChild(base, base.rootId, "a");
    const placed: MindMap = {
      ...a.map,
      nodes: { ...a.map.nodes, [a.nodeId]: { ...a.map.nodes[a.nodeId], position: { x, y } } },
    };
    return { map: placed, root: base.rootId, id: a.nodeId };
  }

  it("メインブランチ（右向き）のラベルは、中心の楕円の外側に出ている枝の、真ん中に置く", () => {
    const { map, id } = mapWithMainAt(180, 0);

    const { x, y } = labelPosition(map, map.nodes[id]);

    // 楕円の端（x=70）に余白（10）を足した 80 から、枝の先（180）までの真ん中
    expect(x).toBeCloseTo((80 + 180) / 2);
    expect(y).toBeCloseTo(0);
  });

  it("上下を向いたメインブランチは、楕円の縦の半径（40）を基準にする", () => {
    const down = mapWithMainAt(0, 180);
    const up = mapWithMainAt(0, -180);

    expect(labelPosition(down.map, down.map.nodes[down.id]).y).toBeCloseTo((50 + 180) / 2);
    expect(labelPosition(up.map, up.map.nodes[up.id]).y).toBeCloseTo(-(50 + 180) / 2);
  });

  it("斜めを向いたメインブランチのラベルは、枝の上にあり、楕円より外側、枝の先より内側にある", () => {
    const { map, id } = mapWithMainAt(127.28, 127.28);

    const { x, y } = labelPosition(map, map.nodes[id]);

    expect(x / y).toBeCloseTo(1); // 中心と枝の先を結ぶ線の上
    const distance = Math.hypot(x, y);
    expect(distance).toBeGreaterThan(60); // 楕円の端（約 49）の外側
    expect(distance).toBeLessThan(180);
  });

  it("中心ノードに画像があるときは、画像の枠の外側から、枝の先までの真ん中", () => {
    const { map, root, id } = mapWithMainAt(260, 0);
    const withImage: MindMap = {
      ...map,
      nodes: { ...map.nodes, [root]: { ...map.nodes[root], image: "data:image/png;base64,AAAA" } },
    };

    // 画像の枠の半幅 80 に余白 10 を足した 90 から、260 までの真ん中
    expect(labelPosition(withImage, withImage.nodes[id]).x).toBeCloseTo((90 + 260) / 2);
  });

  it("画像の倍率に合わせて、枠の外側が変わる", () => {
    const { map, root, id } = mapWithMainAt(400, 0);
    const scaled: MindMap = {
      ...map,
      nodes: {
        ...map.nodes,
        [root]: { ...map.nodes[root], image: "data:image/png;base64,AAAA", style: { imageScale: 2 } },
      },
    };

    expect(labelPosition(scaled, scaled.nodes[id]).x).toBeCloseTo((170 + 400) / 2); // 半幅 160 + 余白 10
  });

  it("画像の枠は、縦の向きでは、半分の高さ（60）を基準にする", () => {
    const { map, root, id } = mapWithMainAt(0, 200);
    const withImage: MindMap = {
      ...map,
      nodes: { ...map.nodes, [root]: { ...map.nodes[root], image: "data:image/png;base64,AAAA" } },
    };

    expect(labelPosition(withImage, withImage.nodes[id]).y).toBeCloseTo((70 + 200) / 2);
  });

  it("サブブランチのラベルは、これまでどおり、親と子を結ぶ枝の中点", () => {
    const { map, id } = mapWithMainAt(180, 0);
    const sub = addChild(map, id, "子");
    const placed: MindMap = {
      ...sub.map,
      nodes: {
        ...sub.map.nodes,
        [sub.nodeId]: { ...sub.map.nodes[sub.nodeId], position: { x: 300, y: 100 } },
      },
    };

    expect(labelPosition(placed, placed.nodes[sub.nodeId])).toEqual({ x: 240, y: 50 });
  });

  it("枝がまだ配置されていない（位置が中心と同じ）、または、楕円より短いときは、枝の中点にする", () => {
    const same = mapWithMainAt(0, 0);
    const short = mapWithMainAt(50, 0);

    expect(labelPosition(same.map, same.map.nodes[same.id])).toEqual({ x: 0, y: 0 });
    expect(labelPosition(short.map, short.map.nodes[short.id])).toEqual({ x: 25, y: 0 });
  });
});

describe("exportSvg: ラベルの折り返し", () => {
  function longMap(label: string) {
    const base = createMindMap("中心");
    const a = addChild(base, base.rootId, label);
    return { map: layout(a.map), id: a.nodeId, root: base.rootId };
  }

  it("短いラベルは、これまでどおり、1つの text（tspan なし）", () => {
    const { map, id } = longMap("企画");
    const text = byNodeId(parse(exportSvg(map)), "text", id);

    expect(text.querySelector("tspan")).toBeNull();
    expect(text.textContent).toBe("企画");
  });

  it("長いラベルは、行ごとの tspan に分け、行の中心が、ラベルの位置の上下に並ぶ", () => {
    const { map, id } = longMap("あ".repeat(25));
    const text = byNodeId(parse(exportSvg(map)), "text", id);
    const lines = [...text.querySelectorAll("tspan")];
    const { x, y } = labelPosition(map, map.nodes[id]);

    expect(lines.map((l) => l.textContent)).toEqual(["あ".repeat(10), "あ".repeat(10), "あ".repeat(5)]);
    const ys = lines.map((l) => Number(l.getAttribute("y")));
    expect(ys[1]).toBeCloseTo(y);
    expect(ys[1] - ys[0]).toBeCloseTo(20 * 1.25);
    expect(ys[2] - ys[1]).toBeCloseTo(20 * 1.25);
    lines.forEach((l) => expect(Number(l.getAttribute("x"))).toBeCloseTo(x));
  });

  it("中心ノードの長いテキストも、折り返す", () => {
    const base = createMindMap("あ".repeat(12));
    const doc = parse(exportSvg(layout(base)));
    const lines = [...byNodeId(doc, "text", base.rootId).querySelectorAll("tspan")];

    expect(lines.map((l) => l.textContent)).toEqual(["あ".repeat(10), "あ".repeat(2)]);
  });

  it("アイコンは、折り返したあとの一番広い行の左に置く", () => {
    const { map, id } = longMap("あ".repeat(25));
    const iconMap = setNodeIcon(map, id, ICON_PRESETS[0].value);
    const { x } = labelPosition(iconMap, iconMap.nodes[id]);
    const g = parse(exportSvg(iconMap)).querySelector(`g[data-icon-for="${id}"]`)!;
    const translate = /translate\(([-\d.]+)/.exec(g.getAttribute("transform") ?? "");

    // 幅は 10 文字ぶん（200）。アイコンの右端は、その左から ICON_GAP(6) 離れる
    const size = 20 * 1.1;
    expect(Number(translate![1])).toBeCloseTo(x - 100 - 6 - size);
  });
});
