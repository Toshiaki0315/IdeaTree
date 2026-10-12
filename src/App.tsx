import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import "./App.css";
import { addChild } from "./domain/addChild";
import { addSibling } from "./domain/addSibling";
import { toggleCollapse } from "./domain/collapse";
import { parseClipboardText, subtreeToText } from "./domain/clipboardText";
import type { ClipboardContent } from "./domain/clipboardText";
import { copyNode } from "./domain/copyNode";
import type { Subtree } from "./domain/copyNode";
import { deleteNode } from "./domain/deleteNode";
import { createHistory, record, redo, undo } from "./domain/history";
import type { History } from "./domain/history";
import { hitAreaSize } from "./domain/hitArea";
import { layout } from "./domain/layout";
import { createMindMap } from "./domain/mindmap";
import type { MindMap, NodeId, NodeStyle } from "./domain/mindmap";
import { setNodeImage } from "./domain/nodeImage";
import { setNodeStyle, toggleStyle } from "./domain/nodeStyle";
import { canMoveTo, canReorderTo, dropNode, moveNode } from "./domain/moveNode";
import { navigate } from "./domain/navigate";
import type { NavigateDirection } from "./domain/navigate";
import { pasteNode } from "./domain/pasteNode";
import { pasteTexts } from "./domain/pasteTexts";
import {
  BACKGROUND,
  CENTRAL_RX,
  CENTRAL_RY,
  LABEL_HALO_WIDTH,
  branchPath,
  centralLabelY,
  depthOf,
  imageBox,
  labelPosition,
  nodeLabel,
  nodeTextStyle,
  strokeWidthAt,
} from "./domain/svgExport";
import { updateText } from "./domain/updateText";
import { visibleNodeIds } from "./domain/visibleNodeIds";
import { readClipboardText, writeClipboardText } from "./files/clipboard";
import { registerCloseGuard } from "./files/closeGuard";
import { confirmDiscard } from "./files/confirmDiscard";
import { loadFile } from "./files/loadFile";
import { pickImage } from "./files/pickImage";
import { saveFile } from "./files/saveFile";
import { svgExportFile } from "./files/svgExportFile";
import StylePanel from "./StylePanel";

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

/** この距離（px）より動かしたら、クリックではなく、ドラッグとみなす */
const DRAG_THRESHOLD = 4;

/** ドラッグの状態（ノードを押してから、離すまで） */
interface Drag {
  nodeId: NodeId;
  startX: number;
  startY: number;
  /** しきい値を超えて、実際にドラッグが始まったか */
  active: boolean;
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

/** ラベルを中心にした、クリック範囲の長方形 */
function hitRect(centerX: number, centerY: number, label: string, fontSize: number) {
  const { width, height } = hitAreaSize(label, fontSize);
  return { x: centerX - width / 2, y: centerY - height / 2, width, height };
}

function initialSnapshot(): Snapshot {
  const map = createMindMap("中心テーマ");
  return { map, selectedId: map.rootId };
}

export default function App() {
  const [initial] = useState(initialSnapshot);
  const [history, setHistory] = useState<History<Snapshot>>(() => createHistory(initial));
  /** 最後に保存した（または開いた）時点のマップ。これと違えば、未保存の変更がある */
  const [savedMap, setSavedMap] = useState<MindMap>(initial.map);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [filePath, setFilePath] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<Message | null>(null);
  const [styleOpen, setStyleOpen] = useState(false);
  const dragRef = useRef<Drag | null>(null);
  /** ドラッグ中に、離すとつなぎ替えられるノード（強調表示する） */
  const [dropTarget, setDropTarget] = useState<{ id: NodeId; mode: "child" | "reorder" } | null>(null);
  /** コピーしたサブツリー。ファイルを開いても保持する */
  const [clipboard, setClipboard] = useState<Subtree | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { map, selectedId } = history.present;
  const mapRef = useRef(map);
  mapRef.current = map;
  const dirty = map !== savedMap;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // ノードのドラッグ移動: 押したノードを、別のノードの上で離すと、そのノードの子につなぎ替える
  useEffect(() => {
    /**
     * マウスの下にあるノードのうち、離したときに移動できるもの。
     * Shift を押していて、兄弟のノードなら、入れ替え（reorder）。そうでなければ、その子につなぎ替える（child）。
     */
    const dropTargetAt = (event: MouseEvent, nodeId: NodeId) => {
      const id = (event.target as Element).closest("g[data-node-id]")?.getAttribute("data-node-id");
      if (id === undefined || id === null) return null;
      if (event.shiftKey && canReorderTo(mapRef.current, nodeId, id)) {
        return { id, mode: "reorder" as const };
      }
      return canMoveTo(mapRef.current, nodeId, id) ? { id, mode: "child" as const } : null;
    };
    const cancel = () => {
      dragRef.current = null;
      setDropTarget(null);
    };

    const onMouseMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (drag === null) return;
      if (!drag.active) {
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <= DRAG_THRESHOLD) {
          return;
        }
        drag.active = true;
        setHistory((h) => ({ ...h, present: { ...h.present, selectedId: drag.nodeId } }));
      }
      setDropTarget(dropTargetAt(event, drag.nodeId));
    };
    const onMouseUp = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (drag === null) return;
      const target = drag.active ? dropTargetAt(event, drag.nodeId) : null;
      cancel();
      if (target !== null) {
        setHistory((h) =>
          record(h, {
            map: dropNode(h.present.map, drag.nodeId, target.id, target.mode),
            selectedId: drag.nodeId,
          }),
        );
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // ウィンドウを閉じるときに、未保存の変更を確認する（Tauri の外では登録に失敗するが、無視する）
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    registerCloseGuard(() => dirtyRef.current, confirmDiscard)
      .then((fn) => (cancelled ? fn() : (unlisten = fn)))
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
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

  /** 選択ノードのサブツリーをコピーする（アプリの中と、システムのクリップボードの両方に保持する） */
  const copySelected = () => {
    const subtree = copyNode(map, selectedId);
    setClipboard(subtree);
    // システムのクリップボードに書けなくても、アプリの中のコピーは使えるので、失敗は無視する
    writeClipboardText(subtreeToText(subtree)).catch(() => {});
  };

  /**
   * 貼り付ける。システムのクリップボードを読んで、IdeaTree のサブツリーなら貼り付け、普通のテキストなら
   * 1行1ノードで追加する。読み込めないときだけ、アプリの中のコピーを使う。
   * 読み込みを待つ間に状態が変わっても、そのときの状態に貼り付けるよう、更新は関数で行う。
   */
  const paste = async () => {
    let content: ClipboardContent;
    try {
      content = parseClipboardText(await readClipboardText());
    } catch {
      content = clipboard ? { kind: "subtree", subtree: clipboard } : { kind: "none" };
    }
    if (content.kind === "none") return;

    setHistory((h) => {
      const { map: current, selectedId: target } = h.present;
      if (content.kind === "subtree") {
        const pasted = pasteNode(expanded(current, target), target, content.subtree);
        return record(h, { map: pasted.map, selectedId: pasted.nodeId });
      }
      const pasted = pasteTexts(current, target, content.lines);
      return record(h, { map: pasted.map, selectedId: pasted.nodeIds[0] });
    });
  };

  /**
   * 選択ノードを、矢印キーの向きに移動する（中心ノード以外）。
   * ↑↓: 兄弟の順序を入れ替える。→: 前の兄弟の最後の子にする。←: 親の直後の兄弟にする。
   * 動かせないとき（先頭・末尾、前の兄弟がない、親が中心ノードなど）は、何もしない。
   */
  const moveSelected = (key: string) => {
    const parentId = map.nodes[selectedId].parentId as NodeId;
    const siblings = map.nodes[parentId].childIds;
    const index = siblings.indexOf(selectedId);
    const grandparentId = map.nodes[parentId].parentId;
    let moved = map;
    if (key === "ArrowUp") moved = moveNode(map, selectedId, parentId, index - 1);
    else if (key === "ArrowDown") moved = moveNode(map, selectedId, parentId, index + 1);
    else if (key === "ArrowRight" && index > 0) moved = moveNode(map, selectedId, siblings[index - 1]);
    else if (key === "ArrowLeft" && grandparentId !== null) {
      const parentIndex = map.nodes[grandparentId].childIds.indexOf(parentId);
      moved = moveNode(map, selectedId, grandparentId, parentIndex + 1);
    }
    if (moved !== map) commit({ map: moved, selectedId });
  };

  /** 選択ノードをサブツリーごと削除し、親を選択する（履歴に1件記録） */
  const deleteSelected = (parentId: NodeId) =>
    commit({ map: deleteNode(map, selectedId), selectedId: parentId });

  /** スタイルパネルでの変更を、1手の履歴として記録する（変化がなければ記録しない） */
  const changeStyle = (patch: Partial<NodeStyle>) => {
    const updated = setNodeStyle(map, selectedId, patch);
    if (updated !== map) commit({ map: updated, selectedId });
  };

  /** 画像を選ばせて、選択ノードに設定する（履歴に1手として記録）。キャンセルなら、何もしない */
  const chooseImage = () =>
    runFileAction(async () => {
      const image = await pickImage();
      if (image === null) return;
      const updated = setNodeImage(map, selectedId, image);
      if (updated !== map) commit({ map: updated, selectedId });
    });

  /** 選択ノードの画像を外す */
  const removeImage = () => commit({ map: setNodeImage(map, selectedId, undefined), selectedId });

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
        setSavedMap(map);
        setMessage({ kind: "status", text: `保存しました: ${path}` });
      }
    });

  /** ファイルを開き、表示中のマップを置き換える（保存先も開いたファイルになる） */
  const open = () =>
    runFileAction(async () => {
      // 未保存の変更は、開くと失われるので、先に確認する
      if (dirty && !(await confirmDiscard())) return;
      const loaded = await loadFile();
      if (loaded !== null) {
        // 別の文書を開くので、元に戻す履歴も新しくする
        setHistory(createHistory({ map: loaded.map, selectedId: loaded.map.rootId }));
        setFilePath(loaded.path);
        setSavedMap(loaded.map);
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

      if (event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.key in ARROW_DIRECTIONS) {
        event.preventDefault();
        if (!isRoot) moveSelected(event.key);
        return;
      }

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
          copySelected();
          return;
        }
        if (key === "i" && event.shiftKey) {
          event.preventDefault();
          void chooseImage();
          return;
        }
        if ((key === "b" || key === "i") && !event.shiftKey) {
          event.preventDefault();
          const toggled = toggleStyle(map, selectedId, key === "b" ? "bold" : "italic");
          commit({ map: toggled, selectedId });
          return;
        }
        if (key === "k" && !event.shiftKey) {
          event.preventDefault();
          setStyleOpen((open) => !open);
          return;
        }
        if (key === "x") {
          event.preventDefault();
          if (!isRoot) {
            copySelected();
            deleteSelected(node.parentId as NodeId);
          }
          return;
        }
        if (key === "v") {
          event.preventDefault();
          void paste();
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
              data-node-id={node.id}
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
          // 中心ノードは、ノードの位置（画像があれば、その下）に、それ以外は、枝の中点にラベルを置く
          const labelX = isRoot ? node.position.x : labelPosition(laidOut, node).x;
          const labelY = isRoot ? centralLabelY(node) : labelPosition(laidOut, node).y;
          const box = node.image ? imageBox(laidOut, node) : null;
          const isEditing = editing?.nodeId === node.id;
          const selected = node.id === selectedId;

          return (
            <g
              key={node.id}
              data-node-id={node.id}
              data-selected={selected}
              data-drop-target={dropTarget?.id === node.id}
              data-drop-mode={dropTarget?.id === node.id ? dropTarget.mode : undefined}
              onMouseDown={(event) => {
                // 左ボタンで、中心ノード以外を押したときだけ、ドラッグの候補にする（入力欄の操作は除く）
                if (event.button !== 0 || isRoot || event.target instanceof HTMLInputElement) return;
                dragRef.current = {
                  nodeId: node.id,
                  startX: event.clientX,
                  startY: event.clientY,
                  active: false,
                };
              }}
              onClick={() => select(node.id)}
              onDoubleClick={() => startEdit(node.id)}
            >
              {!isRoot && (
                // 文字だけでは小さくて押しにくいので、まわりに透明なクリック範囲を置く
                <rect
                  data-role="hit-area"
                  {...hitRect(labelX, labelY, nodeLabel(node), look.fontSize)}
                  fill="transparent"
                />
              )}
              {isRoot && !node.image && (
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
              {node.image && box && (
                <>
                  <image
                    href={node.image}
                    x={box.x}
                    y={box.y}
                    width={box.width}
                    height={box.height}
                    preserveAspectRatio="xMidYMid meet"
                  />
                  {selected && (
                    <rect
                      x={box.x - 4}
                      y={box.y - 4}
                      width={box.width + 8}
                      height={box.height + 8}
                      rx={8}
                      fill="none"
                      stroke="#1A7FD1"
                      strokeWidth={3}
                    />
                  )}
                </>
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
      <div className="doc-state">
        {filePath === undefined ? "無題" : (filePath.split("/").pop() as string)}
        {dirty && " ● 未保存"}
      </div>
      {styleOpen && (
        <StylePanel
          nodeId={selectedId}
          defaultColor={nodeTextStyle(map, map.nodes[selectedId]).color}
          nodeText={map.nodes[selectedId].text}
          style={map.nodes[selectedId].style ?? {}}
          hasImage={map.nodes[selectedId].image !== undefined}
          onChange={changeStyle}
          onChooseImage={() => void chooseImage()}
          onRemoveImage={removeImage}
          onClose={() => setStyleOpen(false)}
        />
      )}
      {message && (
        <div className={`message message-${message.kind}`} role={message.kind}>
          {message.text}
        </div>
      )}
    </>
  );
}
