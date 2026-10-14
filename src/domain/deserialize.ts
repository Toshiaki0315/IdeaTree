import type { MindMap, MindMapNode, NodeId } from "./mindmap";
import { isIcon, legacyIconToId } from "./nodeIcon";
import { isImageDataUrl } from "./nodeImage";
import { isLink, isNote } from "./nodeNote";
import { isColor, isNodeStyle } from "./nodeStyle";
import { SAVE_FORMAT_VERSION } from "./serialize";

const FORMAT_ERROR = "保存データの形式が不正です";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNode(key: string, value: unknown): value is MindMapNode {
  if (!isRecord(value)) return false;
  const {
    id,
    kind,
    text,
    parentId,
    childIds,
    position,
    collapsed,
    style,
    branchColor,
    image,
    icon,
    note,
    link,
  } = value;
  return (
    id === key &&
    (kind === "central" || kind === "branch") &&
    typeof text === "string" &&
    (parentId === null || typeof parentId === "string") &&
    Array.isArray(childIds) &&
    childIds.every((childId) => typeof childId === "string") &&
    isRecord(position) &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    (collapsed === undefined || typeof collapsed === "boolean") &&
    (style === undefined || isNodeStyle(style)) &&
    (branchColor === undefined || isColor(branchColor)) &&
    (image === undefined || isImageDataUrl(image)) &&
    (icon === undefined || isIcon(icon)) &&
    (note === undefined || isNote(note)) &&
    (link === undefined || isLink(link))
  );
}

export interface DeserializeOptions {
  /** コピーしたサブツリーを読むとき true。ルートは、中心ノードでなくてもよい（ブランチでもよい） */
  subtree?: boolean;
}

/** JSON文字列からマインドマップを復元する。不正なデータはエラーにする */
export function deserialize(json: string, options: DeserializeOptions = {}): MindMap {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("JSONの形式が不正です");
  }

  if (!isRecord(data)) throw new Error(FORMAT_ERROR);
  if (data.version !== SAVE_FORMAT_VERSION) {
    throw new Error(`未対応のバージョンです: ${data.version}`);
  }
  const { rootId, nodes: rawNodes } = data;
  if (typeof rootId !== "string" || !isRecord(rawNodes)) throw new Error(FORMAT_ERROR);

  // 以前の版で保存した、絵文字のアイコンは、現在の識別子に変換する
  const nodes = Object.fromEntries(
    Object.entries(rawNodes).map(([key, value]) => {
      const migrated = isRecord(value) ? legacyIconToId(value.icon) : undefined;
      return [key, migrated === undefined ? value : { ...(value as object), icon: migrated }];
    }),
  );
  for (const [key, value] of Object.entries(nodes)) {
    if (!isNode(key, value)) throw new Error(`ノードの形式が不正です: ${key}`);
  }
  const map: MindMap = { rootId, nodes: nodes as Record<NodeId, MindMapNode> };

  const root = map.nodes[rootId];
  if (!root) throw new Error("ルートノードが存在しません");
  if (root.parentId !== null) throw new Error("ルートノードに親があります");

  for (const node of Object.values(map.nodes)) {
    // 中心ノード（central）は、ルートだけ。ファイルのルートは、必ず中心ノード
    const isRoot = node.id === rootId;
    if ((node.kind === "central" && !isRoot) || (isRoot && !options.subtree && node.kind !== "central")) {
      throw new Error(`ノードの種類が不整合です: ${node.id}`);
    }
    if (new Set(node.childIds).size !== node.childIds.length) {
      const duplicated = node.childIds.find((id, i) => node.childIds.indexOf(id) !== i);
      throw new Error(`子ノードが重複しています: ${duplicated}`);
    }
    for (const childId of node.childIds) {
      const child = map.nodes[childId];
      if (!child) throw new Error(`子ノードが存在しません: ${childId}`);
      if (child.parentId !== node.id) throw new Error(`親子関係が不整合です: ${childId}`);
    }
  }

  const reachable = new Set<NodeId>();
  const stack: NodeId[] = [rootId];
  while (stack.length > 0) {
    const id = stack.pop() as NodeId;
    reachable.add(id);
    stack.push(...map.nodes[id].childIds);
  }
  const orphan = Object.keys(map.nodes).find((id) => !reachable.has(id));
  if (orphan !== undefined) throw new Error(`到達できないノードがあります: ${orphan}`);

  return map;
}
