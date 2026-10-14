import type { MindMap, NodeId } from "./domain/mindmap";

/** 履歴の1件分の状態（マップと、そのとき選択していたノード） */
export interface Snapshot {
  map: MindMap;
  selectedId: NodeId;
}

/** 編集中のノードと入力途中のテキスト */
export interface Editing {
  nodeId: NodeId;
  draft: string;
  /** Tab/Enter で追加した直後のノードなら、追加前の状態（取り消し・空確定で、これに戻す）。既存ノードの編集なら null */
  base: Snapshot | null;
}
