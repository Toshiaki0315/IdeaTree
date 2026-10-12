import { describe, expect, it } from "vitest";
import { addChild } from "./addChild";
import { toggleCollapse } from "./collapse";
import { CENTRAL_IMAGE_EXTRA, LEVEL_DISTANCE, layout } from "./layout";
import { setNodeImage } from "./nodeImage";
import { setNodeStyle } from "./nodeStyle";
import { createMindMap } from "./mindmap";
import type { MindMap, NodeId } from "./mindmap";

/** 画面座標（y が下向き）での、原点からの角度。-π 以上 π 未満 */
function angleOf(map: MindMap, id: NodeId): number {
  const { x, y } = map.nodes[id].position;
  return Math.atan2(y, x);
}

/** 角度の差を -π 以上 π 未満に正規化する（一周をまたぐ比較用） */
function wrap(delta: number): number {
  return ((((delta + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
}

/** ノードが、原点から見て指定した角度の方向にあることを確認する（一周をまたいでも正しく比べる） */
function expectDirection(map: MindMap, id: NodeId, angle: number) {
  expect(wrap(angleOf(map, id) - angle), `${map.nodes[id].text} の角度`).toBeCloseTo(0);
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
      expect(wrap(angles[i] - angles[i - 1])).toBeCloseTo(Math.PI / 2);
    }
  });

  it("葉の多いブランチほど広い扇形（角度）を割り当てられる", () => {
    const root = createMindMap("root");
    const mains = addChildren(root, root.rootId, 2);
    const withLeaves = addChildren(mains.map, mains.ids[0], 3);

    const laid = layout(withLeaves.map);

    // 葉は全部で4枚。ブランチAは3/4（3π/2）の扇形で、右向き(0)を中心にした [-3π/4, 3π/4]。Bは残りの [3π/4, 5π/4]（左向き）
    expectDirection(laid, mains.ids[0], 0);
    expectDirection(laid, mains.ids[1], Math.PI);
    // Aの子3つは扇形を3等分した中央に置かれる
    expectDirection(laid, withLeaves.ids[0], -Math.PI / 2);
    expectDirection(laid, withLeaves.ids[1], 0);
    expectDirection(laid, withLeaves.ids[2], Math.PI / 2);
  });

  it("子ノードは、親の扇形の中に childIds の順で時計回りに並ぶ", () => {
    const root = createMindMap("root");
    const mains = addChildren(root, root.rootId, 3);
    const subs = addChildren(mains.map, mains.ids[1], 3);

    const laid = layout(subs.map);
    const mainAngle = angleOf(laid, mains.ids[1]);
    // メインブランチの向きからの角度の差（一周をまたいでも比べられるよう正規化する）
    const offsets = subs.ids.map((id) => wrap(angleOf(laid, id) - mainAngle));

    expect(offsets[0]).toBeLessThan(offsets[1]);
    expect(offsets[1]).toBeLessThan(offsets[2]);
    for (const offset of offsets) {
      // 葉は 1+3+1=5 枚。中央のブランチの扇形幅は 2π×3/5
      expect(Math.abs(offset)).toBeLessThan((2 * Math.PI * 3) / 5 / 2);
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

  describe("開始角（最初のメインブランチの向き）", () => {
    it("最初のメインブランチは、扇形の幅によらず、常に右向き（角度0）の中心に置かれる", () => {
      const root = createMindMap("root");
      const mains = addChildren(root, root.rootId, 3);
      const leaves = addChildren(mains.map, mains.ids[0], 4); // 最初のブランチだけ葉が多い

      const laid = layout(leaves.map);

      expectDirection(laid, mains.ids[0], 0);
    });

    it("メインブランチが2本なら、左右（右と左）に広がる", () => {
      const root = createMindMap("root");
      const mains = addChildren(root, root.rootId, 2);

      const laid = layout(mains.map);

      expect(laid.nodes[mains.ids[0]].position.x).toBeCloseTo(LEVEL_DISTANCE);
      expect(laid.nodes[mains.ids[0]].position.y).toBeCloseTo(0);
      expect(laid.nodes[mains.ids[1]].position.x).toBeCloseTo(-LEVEL_DISTANCE);
      expect(laid.nodes[mains.ids[1]].position.y).toBeCloseTo(0);
    });

    it("メインブランチが3本なら、右・左下・左上の順に、時計回りに配置される", () => {
      const root = createMindMap("root");
      const mains = addChildren(root, root.rootId, 3);

      const laid = layout(mains.map);

      expectDirection(laid, mains.ids[0], 0);
      expectDirection(laid, mains.ids[1], (2 * Math.PI) / 3);
      expectDirection(laid, mains.ids[2], (-2 * Math.PI) / 3);
      // 画面座標（y が下向き）なので、2番目は下側、3番目は上側
      expect(laid.nodes[mains.ids[1]].position.y).toBeGreaterThan(0);
      expect(laid.nodes[mains.ids[2]].position.y).toBeLessThan(0);
    });

    it("メインブランチが4本なら、右・下・左・上に並ぶ", () => {
      const root = createMindMap("root");
      const mains = addChildren(root, root.rootId, 4);

      const laid = layout(mains.map);

      expectDirection(laid, mains.ids[0], 0);
      expectDirection(laid, mains.ids[1], Math.PI / 2);
      expectDirection(laid, mains.ids[2], Math.PI);
      expectDirection(laid, mains.ids[3], -Math.PI / 2);
    });

    it("子ノードは、メインブランチの扇形を分け合って広がる（左右のブランチが、それぞれ半円を使う）", () => {
      const root = createMindMap("root");
      const mains = addChildren(root, root.rootId, 2);
      const right = addChildren(mains.map, mains.ids[0], 2);
      const left = addChildren(right.map, mains.ids[1], 2);

      const laid = layout(left.map);

      // 右のブランチの扇形は [-π/2, π/2]、左のブランチは [π/2, 3π/2]
      expectDirection(laid, right.ids[0], -Math.PI / 4);
      expectDirection(laid, right.ids[1], Math.PI / 4);
      expectDirection(laid, left.ids[0], (3 * Math.PI) / 4);
      expectDirection(laid, left.ids[1], (-3 * Math.PI) / 4);
    });
  });

  describe("折りたたみへの対応", () => {
    it("折りたたまれたブランチは、1枚の葉として扇形を割り当てられる", () => {
      const root = createMindMap("root");
      const mains = addChildren(root, root.rootId, 2);
      const withLeaves = addChildren(mains.map, mains.ids[0], 3);
      const folded = toggleCollapse(withLeaves.map, mains.ids[0]);

      const laid = layout(folded);

      // 葉は A(折りたたみ)=1枚 と B=1枚 の計2枚なので、扇形は半分ずつ（Aが右、Bが左）
      expectDirection(laid, mains.ids[0], 0);
      expectDirection(laid, mains.ids[1], Math.PI);
      expect(distanceOf(laid, mains.ids[0])).toBeCloseTo(LEVEL_DISTANCE);
    });

    it("折りたたまれたノードの子孫は、そのノードと同じ位置に置かれる（孫も同様）", () => {
      const root = createMindMap("root");
      const mains = addChildren(root, root.rootId, 2);
      const subs = addChildren(mains.map, mains.ids[0], 2);
      const deep = addChildren(subs.map, subs.ids[0], 2);
      const folded = toggleCollapse(deep.map, mains.ids[0]);

      const laid = layout(folded);
      const head = laid.nodes[mains.ids[0]].position;

      for (const id of [...subs.ids, ...deep.ids]) {
        expect(laid.nodes[id].position).toEqual(head);
      }
    });

    it("展開すると、折りたたむ前と同じ配置に戻る", () => {
      const root = createMindMap("root");
      const mains = addChildren(root, root.rootId, 3);
      const subs = addChildren(mains.map, mains.ids[1], 3);
      const original = layout(subs.map);

      const unfolded = toggleCollapse(toggleCollapse(subs.map, mains.ids[1]), mains.ids[1]);

      for (const id of Object.keys(original.nodes)) {
        expect(layout(unfolded).nodes[id].position).toEqual(original.nodes[id].position);
      }
    });

    it("内側で折りたたまれたノードの葉の数も、1枚として数える", () => {
      const root = createMindMap("root");
      const mains = addChildren(root, root.rootId, 2);
      const subs = addChildren(mains.map, mains.ids[0], 2);
      const deep = addChildren(subs.map, subs.ids[0], 3); // subs[0] の下に葉3枚
      const folded = toggleCollapse(deep.map, subs.ids[0]); // → subs[0] は1枚

      const laid = layout(folded);

      // A の葉は subs[0](1枚) + subs[1](1枚) = 2枚、B は1枚 → A は 2/3 の扇形 [-2π/3, 2π/3]（右向きが中心）
      expectDirection(laid, mains.ids[0], 0);
      expectDirection(laid, mains.ids[1], Math.PI);
    });

    it("中心ノードを折りたたむと、他のすべてのノードが原点に置かれる", () => {
      const root = createMindMap("root");
      const mains = addChildren(root, root.rootId, 3);
      const subs = addChildren(mains.map, mains.ids[0], 2);

      const laid = layout(toggleCollapse(subs.map, root.rootId));

      for (const node of Object.values(laid.nodes)) {
        expect(node.position).toEqual({ x: 0, y: 0 });
      }
    });

    it("折りたたまれていても、全ノードが位置を持ち、再レイアウトしても結果は変わらない", () => {
      const root = createMindMap("root");
      const mains = addChildren(root, root.rootId, 3);
      const subs = addChildren(mains.map, mains.ids[2], 2);
      const folded = layout(toggleCollapse(subs.map, mains.ids[2]));

      expect(Object.keys(folded.nodes)).toEqual(Object.keys(subs.map.nodes));
      expect(layout(folded)).toEqual(folded);
    });

    it("子を持たないノードに残った折りたたみ状態は、配置に影響しない", () => {
      const root = createMindMap("root");
      const mains = addChildren(root, root.rootId, 3);
      const stale: MindMap = {
        ...mains.map,
        nodes: {
          ...mains.map.nodes,
          [mains.ids[0]]: { ...mains.map.nodes[mains.ids[0]], collapsed: true },
        },
      };

      expect(layout(stale).nodes[mains.ids[0]].position).toEqual(
        layout(mains.map).nodes[mains.ids[0]].position,
      );
    });
  });

  describe("中心ノードの画像（セントラルイメージ）への対応", () => {
    const PNG =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

    it("中心ノードに画像があると、すべてのブランチが、画像の分だけ外側にずれる", () => {
      const root = createMindMap("root");
      const mains = addChildren(root, root.rootId, 3);
      const subs = addChildren(mains.map, mains.ids[0], 2);
      const withImage = setNodeImage(subs.map, root.rootId, PNG);

      const laid = layout(withImage);

      for (const id of mains.ids) {
        expect(distanceOf(laid, id)).toBeCloseTo(LEVEL_DISTANCE + CENTRAL_IMAGE_EXTRA);
      }
      for (const id of subs.ids) {
        expect(distanceOf(laid, id)).toBeCloseTo(LEVEL_DISTANCE * 2 + CENTRAL_IMAGE_EXTRA);
      }
    });

    it("角度（扇形の配分）は、画像があっても変わらない", () => {
      const root = createMindMap("root");
      const mains = addChildren(root, root.rootId, 4);
      const plain = layout(mains.map);

      const withImage = layout(setNodeImage(mains.map, root.rootId, PNG));

      for (const id of mains.ids) {
        expect(wrap(angleOf(withImage, id) - angleOf(plain, id))).toBeCloseTo(0);
      }
    });

    it("画像がなければ（外せば）、これまでどおりの距離になる", () => {
      const root = createMindMap("root");
      const mains = addChildren(root, root.rootId, 2);
      const removed = setNodeImage(setNodeImage(mains.map, root.rootId, PNG), root.rootId, undefined);

      expect(distanceOf(layout(removed), mains.ids[0])).toBeCloseTo(LEVEL_DISTANCE);
    });

    it("中心ノードは、画像があっても、原点に置かれる", () => {
      const root = createMindMap("root");

      expect(layout(setNodeImage(root, root.rootId, PNG)).nodes[root.rootId].position).toEqual({
        x: 0,
        y: 0,
      });
    });

    it("levelDistance オプションは、画像の分のずれに影響しない（階層ごとの距離だけが変わる）", () => {
      const root = createMindMap("root");
      const one = addChild(setNodeImage(root, root.rootId, PNG), root.rootId, "a");

      expect(distanceOf(layout(one.map, { levelDistance: 100 }), one.nodeId)).toBeCloseTo(
        100 + CENTRAL_IMAGE_EXTRA,
      );
    });
  });

  describe("中心ノードの画像の倍率", () => {
    const PNG =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

    it("画像を拡大・縮小すると、ブランチを外側へずらす距離も、倍率に比例して変わる", () => {
      const root = createMindMap("root");
      const one = addChild(setNodeImage(root, root.rootId, PNG), root.rootId, "a");

      const at = (scale: number) =>
        distanceOf(layout(setNodeStyle(one.map, root.rootId, { imageScale: scale })), one.nodeId);

      expect(at(2)).toBeCloseTo(LEVEL_DISTANCE + CENTRAL_IMAGE_EXTRA * 2);
      expect(at(0.5)).toBeCloseTo(LEVEL_DISTANCE + CENTRAL_IMAGE_EXTRA * 0.5);
      expect(at(1)).toBeCloseTo(LEVEL_DISTANCE + CENTRAL_IMAGE_EXTRA);
    });

    it("画像がなければ、倍率を指定しても、距離は変わらない", () => {
      const root = createMindMap("root");
      const one = addChild(root, root.rootId, "a");

      const laid = layout(setNodeStyle(one.map, root.rootId, { imageScale: 3 }));

      expect(distanceOf(laid, one.nodeId)).toBeCloseTo(LEVEL_DISTANCE);
    });
  });
});

