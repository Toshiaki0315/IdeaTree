import type { MindMap, NodeId, Relation } from "./mindmap";

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
