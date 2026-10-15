import { describe, expect, it } from "vitest";
import {
  MIN_TIP_WIDTH,
  branchWidths,
  relationGeometry,
  strokeWidthAt,
  taperedBranchPath,
} from "./nodeGeometry";
import type { MindMapNode } from "./mindmap";

function node(x: number, y: number): MindMapNode {
  return { id: "n", kind: "branch", text: "", parentId: null, childIds: [], position: { x, y } };
}

/** パスの数値を、順に取り出す */
function numbers(d: string): number[] {
  return (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

/** M x y L x y … Z の点列 */
function points(d: string): { x: number; y: number }[] {
  const values = numbers(d);
  return Array.from({ length: values.length / 2 }, (_, i) => ({ x: values[i * 2], y: values[i * 2 + 1] }));
}

describe("branchWidths（枝の太さ）", () => {
  it("根元は、深さごとの線幅（strokeWidthAt）で、先に向かって細くなる", () => {
    const { start, end } = branchWidths(1);

    expect(start).toBe(strokeWidthAt(1));
    expect(end).toBeLessThan(start);
    expect(end).toBeGreaterThan(0);
  });

  it("深いほど、根元も先も細い", () => {
    expect(branchWidths(2).start).toBeLessThan(branchWidths(1).start);
    expect(branchWidths(2).end).toBeLessThan(branchWidths(1).end);
  });

  it("とても深くても、先は、最小の太さ（MIN_TIP_WIDTH）より細くならない", () => {
    expect(branchWidths(30).end).toBe(MIN_TIP_WIDTH);
  });
});

describe("taperedBranchPath（先細りの枝）", () => {
  const from = node(0, 0);
  const to = node(200, 0);

  it("閉じた図形のパス（M … L … Z）になる", () => {
    const d = taperedBranchPath(from, to, 12, 4);

    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d).not.toContain("NaN");
  });

  it("根元の幅が start、先の幅が end になる", () => {
    const pts = points(taperedBranchPath(from, to, 12, 4));
    const half = pts.length / 2;
    const width = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);

    // 左側の点列が、根元から先へ。右側は、先から根元へ（逆順）
    expect(width(pts[0], pts[pts.length - 1])).toBeCloseTo(12, 1);
    expect(width(pts[half - 1], pts[half])).toBeCloseTo(4, 1);
  });

  it("根元と先の中心は、親と子の位置にある", () => {
    const pts = points(taperedBranchPath(from, to, 12, 4));
    const half = pts.length / 2;
    const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    });

    expect(mid(pts[0], pts[pts.length - 1]).x).toBeCloseTo(0, 1);
    expect(mid(pts[0], pts[pts.length - 1]).y).toBeCloseTo(0, 1);
    expect(mid(pts[half - 1], pts[half]).x).toBeCloseTo(200, 1);
    expect(mid(pts[half - 1], pts[half]).y).toBeCloseTo(0, 1);
  });

  it("途中は、根元から先へ、徐々に細くなる", () => {
    const pts = points(taperedBranchPath(from, to, 12, 4));
    const half = pts.length / 2;
    const widths = Array.from({ length: half }, (_, i) =>
      Math.hypot(pts[i].x - pts[pts.length - 1 - i].x, pts[i].y - pts[pts.length - 1 - i].y),
    );

    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeLessThanOrEqual(widths[i - 1] + 1e-6);
    }
  });

  it("親と子が同じ位置でも、NaN にならない", () => {
    const d = taperedBranchPath(node(5, 5), node(5, 5), 12, 4);

    expect(d).not.toContain("NaN");
  });
});

describe("relationGeometry（関連線の形）", () => {
  const a = node(0, 0);
  const b = node(300, 0);

  it("線は、一方のノードから、もう一方のノードへ向かう曲線（M … Q …）", () => {
    const { line } = relationGeometry(a, b);

    expect(line).toMatch(/^M[^A-Za-z]+Q[^A-Za-z]+$/);
    const values = numbers(line);
    expect(values).toHaveLength(6);
    // 端は、ノードの位置から、少し離れた位置（ノードの印に、重ならないように）
    expect(values[0]).toBeGreaterThan(0);
    expect(values[4]).toBeLessThan(300);
  });

  it("曲がりがあり、まっすぐではない（制御点が、2つのノードを結ぶ直線から、外れている）", () => {
    const values = numbers(relationGeometry(a, b).line);

    expect(Math.abs(values[3])).toBeGreaterThan(10);
  });

  it("矢印は、向かう先のノード側に、三角形（M … L … L … Z）で付く", () => {
    const { arrow, line } = relationGeometry(a, b);
    const tip = numbers(arrow).slice(0, 2);
    const end = numbers(line).slice(4, 6);

    expect(arrow).toMatch(/^M[^A-Za-z]+L[^A-Za-z]+L[^A-Za-z]+Z$/);
    expect(tip[0]).toBeCloseTo(end[0], 1);
    expect(tip[1]).toBeCloseTo(end[1], 1);
  });

  it("同じ位置の2ノードでも、NaN にならない", () => {
    const { line, arrow } = relationGeometry(node(5, 5), node(5, 5));

    expect(line + arrow).not.toContain("NaN");
  });
});

describe("relationGeometry: 曲線の中点（ラベルを置く位置）", () => {
  it("中点は、曲線（二次ベジェ）の真ん中で、2つのノードを結ぶ直線から、曲がった側に外れている", () => {
    const { mid } = relationGeometry(node(0, 0), node(300, 0));

    // 始点 (10, 0)・終点 (290, 0)・制御点 (150, 75) の、t = 0.5 の点
    expect(mid.x).toBeCloseTo(150);
    expect(mid.y).toBeCloseTo(37.5);
  });
});
