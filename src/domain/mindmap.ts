export type NodeId = string;

export interface Position {
  x: number;
  y: number;
}

/** ノードの見た目の設定。省略した項目は、既定の見た目（メインブランチの色など）になる */
export interface NodeStyle {
  bold?: boolean;
  italic?: boolean;
  /** 文字と枝の色（#RRGGBB）。省略時はメインブランチの色 */
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  /** ノードの画像の倍率（1 が標準の大きさ） */
  imageScale?: number;
}

export interface MindMapNode {
  id: NodeId;
  kind: "central" | "branch";
  text: string;
  parentId: NodeId | null;
  childIds: NodeId[];
  position: Position;
  /** 子孫を非表示にしているか（省略時は展開状態） */
  collapsed?: boolean;
  style?: NodeStyle;
  /** メインブランチ（中心ノードの子）に割り当てた色（#RRGGBB）。子孫はこの色を引き継ぐ */
  branchColor?: string;
  /** ノードの画像（PNG・JPEG・GIF・WebP の base64 のデータURL）。中心ノードに置くとセントラルイメージになる */
  image?: string;
  /** ノードのアイコン（選択肢の中の記号）。ラベルの横に表示する */
  icon?: string;
  /** ノードのメモ（補足の文章）。ラベルのほかに、残しておきたい説明 */
  note?: string;
  /** ノードのリンク（http・https の URL） */
  link?: string;
  /** 手動配置: 自動配置の位置からの、ずれ。このノードと、子孫に効く（中心ノードには、付けない） */
  offset?: Position;
}

/** 離れた2つのノードを結ぶ、関連線（矢印）。ツリーの親子とは、別のつながり */
export interface Relation {
  id: string;
  /** 矢印の元 */
  from: NodeId;
  /** 矢印の先 */
  to: NodeId;
  /** 線に添える、短い文字（なければ、省略） */
  label?: string;
  /** 線の色（#RRGGBB。なければ、既定のグレー） */
  color?: string;
}

export interface MindMap {
  rootId: NodeId;
  nodes: Record<NodeId, MindMapNode>;
  /** 関連線（なければ、省略） */
  relations?: Relation[];
}

/** セントラルイメージ（中央ノード）だけを持つマインドマップを作成する */
export function createMindMap(title: string): MindMap {
  const id = crypto.randomUUID();
  const root: MindMapNode = {
    id,
    kind: "central",
    text: title,
    parentId: null,
    childIds: [],
    position: { x: 0, y: 0 },
  };
  return { rootId: id, nodes: { [id]: root } };
}
