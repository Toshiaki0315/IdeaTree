import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import "./App.css";
import { addChild } from "./domain/addChild";
import { addSibling } from "./domain/addSibling";
import { getBranchColor } from "./domain/branchColor";
import { deleteNode } from "./domain/deleteNode";
import { createHistory, record, redo, undo } from "./domain/history";
import type { History } from "./domain/history";
import { layout } from "./domain/layout";
import { createMindMap } from "./domain/mindmap";
import type { MindMap, NodeId } from "./domain/mindmap";
import { navigate } from "./domain/navigate";
import type { NavigateDirection } from "./domain/navigate";
import {
  BACKGROUND,
  CENTRAL_RX,
  CENTRAL_RY,
  CENTRAL_STROKE,
  FONT_FAMILY,
  LABEL_HALO_WIDTH,
  branchPath,
  depthOf,
  strokeWidthAt,
} from "./domain/svgExport";
import { updateText } from "./domain/updateText";
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

function initialSnapshot(): Snapshot {
  const map = createMindMap("中心テーマ");
  return { map, selectedId: map.rootId };
}

export default function App() {
  const [history, setHistory] = useState<History<Snapshot>>(() => createHistory(initialSnapshot()));
  const [editing, setEditing] = useState<Editing | null>(null);
  const [filePath, setFilePath] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<Message | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { map, selectedId } = history.present;
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
      commit({ map: updateText(map, editing.nodeId, text), selectedId });
    }
    setEditing(null);
  };

  const cancelEdit = (editing: Editing) => {
    if (editing.base !== null) replacePresent(editing.base);
    setEditing(null);
  };

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
    const onKeyDown = (event: KeyboardEvent) => {
      if (editing || event.target instanceof HTMLInputElement) return;
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

      const node = map.nodes[selectedId];
      const isRoot = node.parentId === null;

      if (event.key === "Tab") {
        event.preventDefault();
        startNewNode(addChild(map, selectedId, ""));
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (isRoot) return;
        startNewNode(addSibling(map, selectedId, ""));
      } else if (event.key === "F2") {
        event.preventDefault();
        setEditing({ nodeId: selectedId, draft: node.text, base: null });
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (isRoot) return;
        const parentId = node.parentId as NodeId;
        commit({ map: deleteNode(map, selectedId), selectedId: parentId });
      } else if (event.key in ARROW_DIRECTIONS) {
        event.preventDefault();
        replacePresent({ map, selectedId: navigate(map, selectedId, ARROW_DIRECTIONS[event.key]) });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [history, editing, filePath]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const nodes = Object.values(laidOut.nodes);
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
              stroke={getBranchColor(laidOut, node.id) as string}
              strokeWidth={strokeWidthAt(depthOf(laidOut, node))}
              strokeLinecap="round"
            />
          );
        })}
        {nodes.map((node) => {
          const isRoot = node.parentId === null;
          const color = isRoot ? CENTRAL_STROKE : (getBranchColor(laidOut, node.id) as string);
          const parent = isRoot ? node : laidOut.nodes[node.parentId as NodeId];
          const labelX = (parent.position.x + node.position.x) / 2;
          const labelY = (parent.position.y + node.position.y) / 2;
          const isEditing = editing?.nodeId === node.id;
          const selected = node.id === selectedId;
  
          return (
            <g key={node.id} data-node-id={node.id} data-selected={selected}>
              {isRoot && (
                <ellipse
                  cx={node.position.x}
                  cy={node.position.y}
                  rx={CENTRAL_RX}
                  ry={CENTRAL_RY}
                  fill={BACKGROUND}
                  stroke={selected ? "#1A7FD1" : CENTRAL_STROKE}
                  strokeWidth={selected ? 6 : 4}
                />
              )}
              {!isEditing && (
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily={FONT_FAMILY}
                  fontSize={isRoot ? 24 : depthOf(laidOut, node) === 1 ? 20 : 16}
                  fontWeight="bold"
                  fill={color}
                  {...(isRoot
                    ? {}
                    : {
                        stroke: selected ? "#FFE066" : BACKGROUND,
                        strokeWidth: LABEL_HALO_WIDTH + (selected ? 3 : 0),
                        paintOrder: "stroke",
                        strokeLinejoin: "round" as const,
                      })}
                >
                  {node.text}
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
