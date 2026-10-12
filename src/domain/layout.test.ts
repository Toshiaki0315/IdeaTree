import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { LEVEL_DISTANCE, layout } from "./layout";
import { createMindMap } from "./mindmap";
import type { MindMap, NodeId } from "./mindmap";

/** 画面座標（y が下向き）での、原点からの角度。-π 以上 π 未満 */
function angleOf(map: MindMap, id: NodeId): number {
  const { x, y } = map.nodes[id].position;
  return Math.atan2(y, x);
}

function distanceOf(map: MindMap, id: NodeId): number {
  const { x, y } = map.nodes[id].position;
  return Math.hypot(x, y);
}

/** 親ノードに子を n 個追加する */
function addChildren(map: MindMap, parentId: NodeId, count: number) {
  let current = map;
  const ids: NodeId[] = [];
  for (let i = 0; i < count; i++) {
    const added = addChild(current, parentId, `n${i}`);
    current = added.map;
    ids.push(added.nodeId);
  }
  return { map: current, ids };
}

describe("layout（放射状レイアウト）", () => {
  it("ルートだけのマップでは、ルートが原点に置かれる", () => {
    const map = createMindMap("root");

    expect(layout(map).nodes[map.rootId].position).toEqual({ x: 0, y: 0 });
  });

  it("ルートは常に原点に置かれる（既存の位置は無視される）", () => {
    const base = createMindMap("root");
    const moved: MindMap = {
      ...base,
      nodes: { [base.rootId]: { ...base.nodes[base.rootId], position: { x: 50, y: 70 } } },
    };

    expect(layout(moved).nodes[base.rootId].position).toEqual({ x: 0, y: 0 });
  });

  it("メインブランチが1本なら、ルートの右側（角度0）に置かれる", () => {
    const root = createMindMap("root");
    const one = addChild(root, root.rootId, "a");

    const laid = layout(one.map);

    expect(laid.nodes[one.nodeId].position.x).toBeCloseTo(LEVEL_DISTANCE);
    expect(laid.nodes[one.nodeId].position.y).toBeCloseTo(0);
  });

  it("ルートからの距離は、深さ × LEVEL_DISTANCE になる", () => {
    const root = createMindMap("root");
    const mains = addChildren(root, root.rootId, 3);
    const subs = addChildren(mains.map, mains.ids[0], 2);
    const deep = addChildren(subs.map, subs.ids[1], 2);

    const laid = layout(deep.map);

    for (const id of mains.ids) expect(distanceOf(laid, id)).toBeCloseTo(LEVEL_DISTANCE);
    for (const id of subs.ids) expect(distanceOf(laid, id)).toBeCloseTo(LEVEL_DISTANCE * 2);
    for (const id of deep.ids) expect(distanceOf(laid, id)).toBeCloseTo(LEVEL_DISTANCE * 3);
  });

  it("levelDistance オプションで階層ごとの距離を変更できる", () => {
    const root = createMindMap("root");
    const one = addChild(root, root.rootId, "a");

    const laid = layout(one.map, { levelDistance: 100 });

    expect(distanceOf(laid, one.nodeId)).toBeCloseTo(100);
  });

  it("同じ重みのメインブランチは、ルートの周りに等角度で配置される", () => {
    const root = createMindMap("root");
    const mains = addChildren(root, root.rootId, 4);

    const laid = layout(mains.map);
    const angles = mains.ids.map((id) => angleOf(laid, id));

    for (let i = 1; i < angles.length; i++) {
      expect(angles[i] - angles[i - 1]).toBeCloseTo(Math.PI / 2);
    }
  });

  it("葉の多いブランチほど広い扇形（角度）を割り当てられる", () => {
    const root = createMindMap("root");
    const mains = addChildren(root, root.rootId, 2);
    const withLeaves = addChildren(mains.map, mains.ids[0], 3);

    const laid = layout(withLeaves.map);

    // 葉は全部で4枚。ブランチAは3/4（3π/2）の扇形 [-π, π/2]、Bは残り [π/2, π]
    expect(angleOf(laid, mains.ids[0])).toBeCloseTo(-Math.PI / 4);
    expect(angleOf(laid, mains.ids[1])).toBeCloseTo((3 * Math.PI) / 4);
    // Aの子3つは扇形を3等分した中央に置かれる
    const childAngles = withLeaves.ids.map((id) => angleOf(laid, id));
    expect(childAngles[0]).toBeCloseTo((-3 * Math.PI) / 4);
    expect(childAngles[1]).toBeCloseTo(-Math.PI / 4);
    expect(childAngles[2]).toBeCloseTo(Math.PI / 4);
  });

  it("子ノードは、親の扇形の中に childIds の順で時計回りに並ぶ", () => {
    const root = createMindMap("root");
    const mains = addChildren(root, root.rootId, 3);
    const subs = addChildren(mains.map, mains.ids[1], 3);

    const laid = layout(subs.map);
    const mainAngle = angleOf(laid, mains.ids[1]);
    const subAngles = subs.ids.map((id) => angleOf(laid, id));

    expect(subAngles[0]).toBeLessThan(subAngles[1]);
    expect(subAngles[1]).toBeLessThan(subAngles[2]);
    for (const angle of subAngles) {
      // 葉は 1+3+1=5 枚。中央のブランチの扇形幅は 2π×3/5
      expect(Math.abs(angle - mainAngle)).toBeLessThan((2 * Math.PI * 3) / 5 / 2);
    }
  });

  it("すべてのノードが異なる位置に配置される", () => {
    const root = createMindMap("root");
    const mains = addChildren(root, root.rootId, 5);
    let map = mains.map;
    for (const id of mains.ids) map = addChildren(map, id, 3).map;

    const laid = layout(map);
    const keys = Object.values(laid.nodes).map(
      (n) => `${n.position.x.toFixed(6)},${n.position.y.toFixed(6)}`,
    );

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("位置以外のプロパティは変更されず、元のマップも変更しない", () => {
    const root = createMindMap("root");
    const mains = addChildren(root, root.rootId, 2);
    const before = structuredClone(mains.map);

    const laid = layout(mains.map);

    expect(mains.map).toEqual(before);
    expect(laid.rootId).toBe(mains.map.rootId);
    for (const [id, node] of Object.entries(laid.nodes)) {
      expect({ ...node, position: null }).toEqual({ ...mains.map.nodes[id], position: null });
    }
  });

  it("再度レイアウトしても結果は変わらない（冪等）", () => {
    const root = createMindMap("root");
    const mains = addChildren(root, root.rootId, 3);
    const subs = addChildren(mains.map, mains.ids[2], 2);

    const once = layout(subs.map);

    expect(layout(once)).toEqual(once);
  });

  it.each([[0], [-10], [Number.NaN]])(
    "levelDistance が正の数でない（%s）場合はエラーになる",
    (levelDistance) => {
      const map = createMindMap("root");

      expect(() => layout(map, { levelDistance })).toThrow(
        "levelDistance は正の数でなければなりません",
      );
    },
  );
});
