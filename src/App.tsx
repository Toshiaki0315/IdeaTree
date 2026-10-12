import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import "./App.css";
import { addChild } from "./domain/addChild";
import { addSibling } from "./domain/addSibling";
import { toggleCollapse } from "./domain/collapse";
import { copyNode } from "./domain/copyNode";
import type { Subtree } from "./domain/copyNode";
import { deleteNode } from "./domain/deleteNode";
import { createHistory, record, redo, undo } from "./domain/history";
import type { History } from "./domain/history";
import { layout } from "./domain/layout";
import { createMindMap } from "./domain/mindmap";
import type { MindMap, NodeId } from "./domain/mindmap";
import { toggleStyle } from "./domain/nodeStyle";
import { navigate } from "./domain/navigate";
import type { NavigateDirection } from "./domain/navigate";
import { pasteNode } from "./domain/pasteNode";
import {
  BACKGROUND,
  CENTRAL_RX,
  CENTRAL_RY,
  LABEL_HALO_WIDTH,
  branchPath,
  depthOf,
  nodeLabel,
  nodeTextStyle,
  strokeWidthAt,
} from "./domain/svgExport";
import { updateText } from "./domain/updateText";
import { visibleNodeIds } from "./domain/visibleNodeIds";
import { loadFile } from "./files/loadFile";
import { saveFile } from "./files/saveFile";
import { svgExportFile } from "./files/svgExportFile";

/** 履歴の1件分の状態（マップと、そのとき選択していたノード） */
interface Snapshot {
  map: MindMap;
  selectedId: NodeId;
}

/** 編集中のノードと入力途中のテキスト */
interface Editing {
  nodeId: NodeId;
  draft: string;
  /** Tab/Enter で追加した直後のノードなら、追加前の状態（取り消し・空確定で、これに戻す）。既存ノードの編集なら null */
  base: Snapshot | null;
}

/** 画面下部に表示する、保存結果などのメッセージ */
interface Message {
  kind: "status" | "alert";
  text: string;
}

function errorMessage(error: unknown): Message {
  return { kind: "alert", text: error instanceof Error ? error.message : String(error) };
}

const ARROW_DIRECTIONS: Record<string, NavigateDirection> = {
  ArrowRight: "firstChild",
  ArrowLeft: "parent",
  ArrowDown: "nextSibling",
  ArrowUp: "prevSibling",
};

/** 表示領域の最小の半径。マップが小さい間は拡大しすぎないようにする */
const MIN_HALF_EXTENT = 450;
const VIEW_MARGIN = 160;

/** 折りたたまれているノードを展開する（子を追加・貼り付けしても、見えなくならないように） */
function expanded(map: MindMap, nodeId: NodeId): MindMap {
  return map.nodes[nodeId].collapsed ? toggleCollapse(map, nodeId) : map;
}

function initialSnapshot(): Snapshot {
  const map = createMindMap("中心テーマ");
  return { map, selectedId: map.rootId };
}

export default function App() {
  const [history, setHistory] = useState<History<Snapshot>>(() => createHistory(initialSnapshot()));
  const [editing, setEditing] = useState<Editing | null>(null);
  const [filePath, setFilePath] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<Message | null>(null);
  /** コピーしたサブツリー。ファイルを開いても保持する */
  const [clipboard, setClipboard] = useState<Subtree | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { map, selectedId } = history.present;
  // 入力欄のフォーカス外れで、すでに確定・取り消し済みの編集を二重に処理しないための参照
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const laidOut = useMemo(() => layout(map), [map]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing?.nodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 現在の状態を、履歴に残さずに置き換える（選択の移動や、確定前のノードの表示に使う） */
  const replacePresent = (snapshot: Snapshot) => setHistory({ ...history, present: snapshot });

  /** 変更を履歴に記録する */
  const commit = (snapshot: Snapshot) => setHistory(record(history, snapshot));

  /** ノードを選択する（履歴には残さない） */
  const select = (nodeId: NodeId) => replacePresent({ map, selectedId: nodeId });

  /** 既存のノードのテキスト編集を始める */
  const startEdit = (nodeId: NodeId) =>
    setEditing({ nodeId, draft: map.nodes[nodeId].text, base: null });

  /** ノードを追加して選択し、テキストの入力を始める。確定するまで履歴には残さない */
  const startNewNode = (added: { map: MindMap; nodeId: NodeId }) => {
    replacePresent({ map: added.map, selectedId: added.nodeId });
    setEditing({ nodeId: added.nodeId, draft: "", base: history.present });
  };

  const commitEdit = (editing: Editing) => {
    const text = editing.draft.trim();
    if (editing.base !== null) {
      // 追加直後のノード。空なら破棄して追加前に戻し、入力があれば追加＋命名を1件の変更として記録する
      if (text === "") {
        replacePresent(editing.base);
      } else {
        setHistory(
          record(
            { ...history, present: editing.base },
            { map: updateText(map, editing.nodeId, text), selectedId: editing.nodeId },
          ),
        );
      }
    } else if (text !== "" && text !== map.nodes[editing.nodeId].text) {
      commit({ map: updateText(map, editing.nodeId, text), selectedId: editing.nodeId });
    }
    setEditing(null);
  };

  const cancelEdit = (editing: Editing) => {
    if (editing.base !== null) replacePresent(editing.base);
    setEditing(null);
  };

  /** 選択ノードをサブツリーごと削除し、親を選択する（履歴に1件記録） */
  const deleteSelected = (parentId: NodeId) =>
    commit({ map: deleteNode(map, selectedId), selectedId: parentId });

  /** ファイル操作を実行し、失敗したらエラーメッセージを表示する */
  const runFileAction = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  /** 保存する。saveAs が true なら保存先を決め直す（名前を付けて保存） */
  const save = (saveAs: boolean) =>
    runFileAction(async () => {
      const path = await saveFile(map, saveAs ? undefined : filePath);
      if (path !== null) {
        setFilePath(path);
        setMessage({ kind: "status", text: `保存しました: ${path}` });
      }
    });

  /** ファイルを開き、表示中のマップを置き換える（保存先も開いたファイルになる） */
  const open = () =>
    runFileAction(async () => {
      const loaded = await loadFile();
      if (loaded !== null) {
        // 別の文書を開くので、元に戻す履歴も新しくする
        setHistory(createHistory({ map: loaded.map, selectedId: loaded.map.rootId }));
        setFilePath(loaded.path);
        setMessage({ kind: "status", text: `開きました: ${loaded.path}` });
      }
    });

  /** SVG画像として書き出す（保存先は変えない） */
  const exportImage = () =>
    runFileAction(async () => {
      const path = await svgExportFile(map);
      if (path !== null) {
        setMessage({ kind: "status", text: `書き出しました: ${path}` });
      }
    });

  useEffect(() => {
    // 編集中のキー入力は、入力欄が受け取って伝播を止める（ここには届かない）
    const onKeyDown = (event: KeyboardEvent) => {
      const node = map.nodes[selectedId];
      const isRoot = node.parentId === null;

      if (event.metaKey && !event.ctrlKey && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "s") {
          event.preventDefault();
          void save(event.shiftKey);
          return;
        }
        if (key === "o") {
          event.preventDefault();
          void open();
          return;
        }
        if (key === "c") {
          event.preventDefault();
          setClipboard(copyNode(map, selectedId));
          return;
        }
        if ((key === "b" || key === "i") && !event.shiftKey) {
          event.preventDefault();
          const toggled = toggleStyle(map, selectedId, key === "b" ? "bold" : "italic");
          commit({ map: toggled, selectedId });
          return;
        }
        if (key === "x") {
          event.preventDefault();
          if (!isRoot) {
            setClipboard(copyNode(map, selectedId));
            deleteSelected(node.parentId as NodeId);
          }
          return;
        }
        if (key === "v") {
          event.preventDefault();
          if (clipboard !== null) {
            const pasted = pasteNode(expanded(map, selectedId), selectedId, clipboard);
            commit({ map: pasted.map, selectedId: pasted.nodeId });
          }
          return;
        }
        if (key === "z") {
          event.preventDefault();
          setHistory(event.shiftKey ? redo(history) : undo(history));
          return;
        }
        if (key === "e" && event.shiftKey) {
          event.preventDefault();
          void exportImage();
          return;
        }
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === " ") {
        event.preventDefault();
        const toggled = toggleCollapse(map, selectedId);
        if (toggled !== map) commit({ map: toggled, selectedId });
      } else if (event.key === "Tab") {
        event.preventDefault();
        startNewNode(addChild(expanded(map, selectedId), selectedId, ""));
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (isRoot) return;
        startNewNode(addSibling(map, selectedId, ""));
      } else if (event.key === "F2") {
        event.preventDefault();
        startEdit(selectedId);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (!isRoot) deleteSelected(node.parentId as NodeId);
      } else if (event.key in ARROW_DIRECTIONS) {
        event.preventDefault();
        replacePresent({ map, selectedId: navigate(map, selectedId, ARROW_DIRECTIONS[event.key]) });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [history, filePath, clipboard]); // eslint-disable-line react-hooks/exhaustive-deps

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>, editing: Editing) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      commitEdit(editing);
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit(editing);
    } else if (event.key === "Tab") {
      event.preventDefault();
    }
  };

  const nodes = visibleNodeIds(laidOut).map((id) => laidOut.nodes[id]);
  const half = Math.max(
    MIN_HALF_EXTENT,
    ...nodes.map((n) => Math.max(Math.abs(n.position.x), Math.abs(n.position.y)) + VIEW_MARGIN),
  );

  return (
    <>
      <svg
        className="mindmap"
        role="application"
        aria-label="マインドマップ"
        viewBox={`${-half} ${-half} ${half * 2} ${half * 2}`}
      >
        <rect x={-half} y={-half} width={half * 2} height={half * 2} fill={BACKGROUND} />
        {nodes.map((node) => {
          if (node.parentId === null) return null;
          return (
            <path
              key={node.id}
              d={branchPath(laidOut.nodes[node.parentId], node)}
              fill="none"
              stroke={nodeTextStyle(laidOut, node).color}
              strokeWidth={strokeWidthAt(depthOf(laidOut, node))}
              strokeLinecap="round"
            />
          );
        })}
        {nodes.map((node) => {
          const isRoot = node.parentId === null;
          const look = nodeTextStyle(laidOut, node);
          const parent = isRoot ? node : laidOut.nodes[node.parentId as NodeId];
          const labelX = (parent.position.x + node.position.x) / 2;
          const labelY = (parent.position.y + node.position.y) / 2;
          const isEditing = editing?.nodeId === node.id;
          const selected = node.id === selectedId;

          return (
            <g
              key={node.id}
              data-node-id={node.id}
              data-selected={selected}
              onClick={() => select(node.id)}
              onDoubleClick={() => startEdit(node.id)}
            >
              {isRoot && (
                <ellipse
                  cx={node.position.x}
                  cy={node.position.y}
                  rx={CENTRAL_RX}
                  ry={CENTRAL_RY}
                  fill={BACKGROUND}
                  stroke={selected ? "#1A7FD1" : look.color}
                  strokeWidth={selected ? 6 : 4}
                />
              )}
              {!isEditing && (
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily={look.fontFamily}
                  fontSize={look.fontSize}
                  fontWeight={look.fontWeight}
                  fontStyle={look.fontStyle}
                  fill={look.color}
                  {...(isRoot
                    ? {}
                    : {
                        stroke: selected ? "#FFE066" : BACKGROUND,
                        strokeWidth: LABEL_HALO_WIDTH + (selected ? 3 : 0),
                        paintOrder: "stroke",
                        strokeLinejoin: "round" as const,
                      })}
                >
                  {nodeLabel(node)}
                </text>
              )}
              {isEditing && editing && (
                <foreignObject x={labelX - 80} y={labelY - 18} width={160} height={36}>
                  <input
                    ref={inputRef}
                    className="node-input"
                    aria-label="ノードのテキスト"
                    value={editing.draft}
                    onChange={(event) => setEditing({ ...editing, draft: event.target.value })}
                    onKeyDown={(event) => onInputKeyDown(event, editing)}
                    onBlur={() => editingRef.current !== null && commitEdit(editing)}
                    onClick={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                  />
                </foreignObject>
              )}
            </g>
          );
        })}
      </svg>
      {message && (
        <div className={`message message-${message.kind}`} role={message.kind}>
          {message.text}
        </div>
      )}
    </>
  );
}
