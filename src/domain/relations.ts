import type { MindMap, NodeId, Relation } from "./mindmap";
import { isColor } from "./nodeStyle";

/** 関連線のラベルの長さの上限（文字数） */
export const MAX_RELATION_LABEL = 100;

/** 2つのノードを結ぶ関連線を、向きによらず、探す */
export function findRelation(map: MindMap, a: NodeId, b: NodeId): Relation | undefined {
  return map.relations?.find((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a));
}

/** relations が空になったら、項目ごと外したマップにする */
function withRelations(map: MindMap, relations: Relation[]): MindMap {
  const updated: MindMap = { ...map, relations };
  if (relations.length === 0) delete updated.relations;
  return updated;
}

/**
 * 2つのノードの関連線を、追加する（すでにあれば、向きによらず、解除する）。元のマップは変更しない。
 * 同じノードどうしや、存在しないノードは、エラーにする。
 */
export function toggleRelation(map: MindMap, from: NodeId, to: NodeId): MindMap {
  for (const id of [from, to]) {
    if (!map.nodes[id]) throw new Error(`ノードが存在しません: ${id}`);
  }
  if (from === to) throw new Error("同じノードは、結べません");

  const existing = findRelation(map, from, to);
  const relations = map.relations ?? [];
  return withRelations(
    map,
    existing
      ? relations.filter((r) => r !== existing)
      : [...relations, { id: crypto.randomUUID(), from, to }],
  );
}

/** 指定したノードのどれかにつながる関連線を、すべて外す（ノードの削除のときに使う）。変化がなければ、同じマップ */
export function removeRelationsOf(map: MindMap, removed: ReadonlySet<NodeId>): MindMap {
  const relations = map.relations ?? [];
  const kept = relations.filter((r) => !removed.has(r.from) && !removed.has(r.to));
  return kept.length === relations.length ? map : withRelations(map, kept);
}

/**
 * 関連線のラベルと色を変える。指定した項目だけを変え、undefined で外す（空白だけのラベルも、外す）。
 * ラベルは、前後の空白を取り除き、改行は空白にする。元のマップは変更しない。変化がなければ、同じマップを返す。
 */
export function updateRelation(
  map: MindMap,
  relationId: string,
  patch: { label?: string | undefined; color?: string | undefined },
): MindMap {
  const relation = map.relations?.find((r) => r.id === relationId);
  if (!relation) throw new Error(`関連線が存在しません: ${relationId}`);

  const updated: Relation = { ...relation };
  if ("label" in patch) {
    const label = patch.label?.replace(/\r?\n/g, " ").trim();
    if (label !== undefined && label.length > MAX_RELATION_LABEL) {
      throw new Error(`ラベルが長すぎます（上限 ${MAX_RELATION_LABEL} 文字）`);
    }
    if (label === undefined || label === "") delete updated.label;
    else updated.label = label;
  }
  if ("color" in patch) {
    if (patch.color !== undefined && !isColor(patch.color))
      throw new Error("色は、#RRGGBB の形式にしてください");
    if (patch.color === undefined) delete updated.color;
    else updated.color = patch.color;
  }
  if (updated.label === relation.label && updated.color === relation.color) return map;

  return { ...map, relations: (map.relations as Relation[]).map((r) => (r === relation ? updated : r)) };
}

/** 関連線を、削除する。存在しなければ、エラー */
export function removeRelation(map: MindMap, relationId: string): MindMap {
  const relation = map.relations?.find((r) => r.id === relationId);
  if (!relation) throw new Error(`関連線が存在しません: ${relationId}`);
  return withRelations(
    map,
    (map.relations as Relation[]).filter((r) => r !== relation),
  );
}
