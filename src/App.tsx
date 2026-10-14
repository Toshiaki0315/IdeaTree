import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import "./App.css";
import type { Editing, Snapshot } from "./editorState";
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
import { layout } from "./domain/layout";
import { createMindMap } from "./domain/mindmap";
import type { MindMap, NodeId, NodeStyle } from "./domain/mindmap";
import { setNodeIcon } from "./domain/nodeIcon";
import { setNodeImage } from "./domain/nodeImage";
import { setNodeStyle, toggleStyle } from "./domain/nodeStyle";
import { moveNode } from "./domain/moveNode";
import { navigate } from "./domain/navigate";
import type { NavigateDirection } from "./domain/navigate";
import { pasteNode } from "./domain/pasteNode";
import { pasteTexts } from "./domain/pasteTexts";
import { BACKGROUND, branchPath, depthOf, nodeTextStyle, strokeWidthAt } from "./domain/nodeGeometry";
import { documentOrder, revealNode, searchNodes } from "./domain/search";
import { updateText } from "./domain/updateText";
import { DEFAULT_VIEWPORT, zoomIn, zoomOut } from "./domain/viewport";
import { visibleNodeIds } from "./domain/visibleNodeIds";
import { readClipboardText, writeClipboardText } from "./files/clipboard";
import { registerCloseGuard } from "./files/closeGuard";
import { confirmDiscard } from "./files/confirmDiscard";
import { errorMessage } from "./files/errorMessage";
import { exportFile } from "./files/exportFile";
import { loadFile, loadFileAt } from "./files/loadFile";
import { onOpenFileRequest, takePendingOpenFiles } from "./files/openRequests";
import { pickImage } from "./files/pickImage";
import { saveFile } from "./files/saveFile";
import { confirmDiscardAndClearAutosave, useAutosave } from "./hooks/useAutosave";
import { useNodeDrag } from "./hooks/useNodeDrag";
import { useRecentFiles } from "./hooks/useRecentFiles";
import { useViewport } from "./hooks/useViewport";
import { useSubscription } from "./hooks/useSubscription";
import NodeView from "./NodeView";
import RecentFilesPanel from "./RecentFilesPanel";
import SearchBar from "./SearchBar";
import ShortcutHelp from "./ShortcutHelp";
import StylePanel from "./StylePanel";

/** 画面の上に重ねて開くパネル */
type Panel = "style" | "help" | "search" | "recent";

/** 画面下部に表示する、保存結果などのメッセージ */
interface Message {
  kind: "status" | "alert";
  text: string;
}

function errorToMessage(error: unknown): Message {
  return { kind: "alert", text: errorMessage(error) };
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

/** 日本語入力の変換中に、キーイベントに付く keyCode */
const IME_KEY_CODE = 229;

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
  /** 開いているパネル（同時には、1つしか開かない） */
  const [panel, setPanel] = useState<Panel | null>(null);
  const searchOpen = panel === "search";
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchFocusToken, setSearchFocusToken] = useState(0);
  const recent = useRecentFiles();
  /** コピーしたサブツリー。ファイルを開いても保持する */
  const [clipboard, setClipboard] = useState<Subtree | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { map, selectedId } = history.present;
  const mapRef = useRef(map);
  mapRef.current = map;
  const dirty = map !== savedMap;
  // 検索: 一致するノード（検索バーを開いている間だけ）と、今の一致
  const matches = useMemo(
    () => (searchOpen ? searchNodes(map, searchQuery) : []),
    [map, searchOpen, searchQuery],
  );
  const matchSet = new Set(matches);
  const currentMatch = matches[searchIndex];
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const autosaveReady = useAutosave({
    map,
    filePath,
    dirty,
    onRestore: (saved) => {
      setHistory(createHistory({ map: saved.map, selectedId: saved.map.rootId }));
      setFilePath(saved.filePath);
      setMessage({ kind: "status", text: "前回の編集内容を復元しました" });
    },
  });

  // Finder から渡されたファイルを開く。起動時に溜まっていた分は、自動保存の確認が終わってから
  const openPathRef = useRef<(path: string) => Promise<void>>(undefined as never); // 毎回の描画で openPath を入れる
  useEffect(() => {
    if (!autosaveReady) return;
    takePendingOpenFiles()
      .then((paths) => {
        if (paths.length > 0) void openPathRef.current(paths[0]);
      })
      .catch(() => {});
  }, [autosaveReady]);
  // 起動中に頼まれたファイルを開く
  useSubscription(() => onOpenFileRequest((path) => void openPathRef.current(path)));

  // ウィンドウを閉じるときに、未保存の変更を確認する
  useSubscription(() => registerCloseGuard(() => dirtyRef.current, confirmDiscardAndClearAutosave));

  // 入力欄のフォーカス外れで、すでに確定・取り消し済みの編集を二重に処理しないための参照
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const laidOut = useMemo(() => layout(map), [map]);
  const nodes = visibleNodeIds(laidOut).map((id) => laidOut.nodes[id]);
  /** 拡大率 100% のとき、中心から見える距離。マップが大きくなったら、広げる */
  const half = Math.max(
    MIN_HALF_EXTENT,
    ...nodes.map((n) => Math.max(Math.abs(n.position.x), Math.abs(n.position.y)) + VIEW_MARGIN),
  );

  const { viewport, setViewport, view, svgRef, startPan } = useViewport(
    half,
    selectedId,
    laidOut.nodes[selectedId].position,
  );
  const { dropTarget, startDrag } = useNodeDrag(mapRef, setHistory);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing?.nodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** パネルを開閉する（別のパネルが開いていれば、閉じる） */
  const togglePanel = (name: Panel) => setPanel((current) => (current === name ? null : name));
  /** 指定のパネルが開いているときだけ、閉じる（別のパネルに替わっていれば、そのまま） */
  const closePanel = (name: Panel) => setPanel((current) => (current === name ? null : current));

  /** 現在の状態を、履歴に残さずに置き換える（選択の移動や、確定前のノードの表示に使う） */
  const replacePresent = (snapshot: Snapshot) => setHistory({ ...history, present: snapshot });

  /** 変更を履歴に記録する */
  const commit = (snapshot: Snapshot) => setHistory(record(history, snapshot));

  /** ノードを選択する（履歴には残さない） */
  const select = (nodeId: NodeId) => replacePresent({ map, selectedId: nodeId });

  /** 既存のノードのテキスト編集を始める */
  const startEdit = (nodeId: NodeId) => setEditing({ nodeId, draft: map.nodes[nodeId].text, base: null });

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

  /** 検索の一致を、選択する。折りたたまれた枝の中なら、展開して見せる（変更があれば、1手の履歴） */
  const goToMatch = (nodeId: NodeId) => {
    const revealed = revealNode(map, nodeId);
    if (revealed === map) select(nodeId);
    else commit({ map: revealed, selectedId: nodeId });
  };

  /** 検索語が変わったら、今の選択以降の、最初の一致（なければ、先頭）を選ぶ */
  const changeSearchQuery = (query: string) => {
    setSearchQuery(query);
    const found = searchNodes(map, query);
    if (found.length === 0) {
      setSearchIndex(0);
      return;
    }
    const order = documentOrder(map);
    const from = order.indexOf(selectedId);
    const next = found.findIndex((id) => order.indexOf(id) >= from);
    const index = next === -1 ? 0 : next;
    setSearchIndex(index);
    goToMatch(found[index]);
  };

  /** 次（1）または前（-1）の一致へ移動する。端では、反対側へ回り込む */
  const moveSearch = (step: number) => {
    if (matches.length === 0) return;
    const index = (searchIndex + step + matches.length) % matches.length;
    setSearchIndex(index);
    goToMatch(matches[index]);
  };

  const closeSearch = () => {
    closePanel("search");
    setSearchQuery("");
    setSearchIndex(0);
  };

  /** スタイルパネルでのアイコンの変更を、1手の履歴として記録する（選び直しは、変更にならない） */
  const changeIcon = (icon: string | undefined) =>
    commit({ map: setNodeIcon(map, selectedId, icon), selectedId });

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
      setMessage(errorToMessage(error));
    }
  };

  /** 保存する。saveAs が true なら保存先を決め直す（名前を付けて保存） */
  const save = (saveAs: boolean) =>
    runFileAction(async () => {
      const path = await saveFile(map, saveAs ? undefined : filePath);
      if (path !== null) {
        setFilePath(path);
        setSavedMap(map);
        recent.remember(path);
        setMessage({ kind: "status", text: `保存しました: ${path}` });
      }
    });

  /** ファイルを開き、表示中のマップを置き換える（保存先も開いたファイルになる） */
  const open = () =>
    runFileAction(async () => {
      // 未保存の変更は、開くと失われるので、先に確認する
      if (dirty && !(await confirmDiscard())) return;
      const loaded = await loadFile();
      if (loaded !== null) showLoaded(loaded);
    });

  /** 読み込んだ文書を表示する */
  const showLoaded = (loaded: { map: MindMap; path: string }) => {
    // 別の文書を開くので、元に戻す履歴も新しくする
    setHistory(createHistory({ map: loaded.map, selectedId: loaded.map.rootId }));
    setFilePath(loaded.path);
    setSavedMap(loaded.map);
    setViewport(DEFAULT_VIEWPORT);
    recent.remember(loaded.path);
    setMessage({ kind: "status", text: `開きました: ${loaded.path}` });
  };

  /** パスを指定してファイルを開く（最近使ったファイル・Finder から）。開けなければ、一覧から外す */
  const openPath = (path: string) =>
    runFileAction(async () => {
      if (dirty && !(await confirmDiscard())) return;
      closePanel("recent");
      try {
        showLoaded(await loadFileAt(path));
      } catch (error) {
        recent.forget(path);
        throw error;
      }
    });
  openPathRef.current = openPath;

  /** SVG・PNG・PDF として書き出す（保存先は変えない） */
  const exportImage = () =>
    runFileAction(async () => {
      const path = await exportFile(map);
      if (path !== null) {
        setMessage({ kind: "status", text: `書き出しました: ${path}` });
      }
    });

  // キー操作の処理は、描画のたびに作り直して ref に入れ、リスナーは一度だけ登録する。
  // （依存配列で登録し直す方式だと、依存に入れ忘れた状態（保存済みかどうかなど）が古いままになる）
  const keyDownRef = useRef<(event: KeyboardEvent) => void>(undefined as never);
  // 編集中のキー入力は、入力欄が受け取って伝播を止める（ここには届かない）
  const onKeyDown = (event: KeyboardEvent) => {
    const node = map.nodes[selectedId];
    const isRoot = node.parentId === null;

    if (
      event.altKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      event.key in ARROW_DIRECTIONS
    ) {
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
      if (key === "o" && event.shiftKey) {
        event.preventDefault();
        togglePanel("recent");
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
      if (key === "=" || key === "+") {
        event.preventDefault();
        setViewport(zoomIn);
        return;
      }
      if (key === "-") {
        event.preventDefault();
        setViewport(zoomOut);
        return;
      }
      if (key === "0") {
        event.preventDefault();
        setViewport(DEFAULT_VIEWPORT);
        return;
      }
      if (key === "/" || key === "?") {
        event.preventDefault();
        togglePanel("help");
        return;
      }
      if (key === "f" && !event.shiftKey) {
        event.preventDefault();
        setPanel("search");
        setSearchFocusToken((token) => token + 1);
        return;
      }
      if (key === "k" && !event.shiftKey) {
        event.preventDefault();
        togglePanel("style");
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
  keyDownRef.current = onKeyDown;

  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyDownRef.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>, editing: Editing) => {
    event.stopPropagation();
    // 日本語入力の変換中（確定直後の keyCode 229 を含む）のキーは、変換のためのもの。
    // 最初の Enter は変換の確定だけにして、ノードの確定・取り消しは、次のキーで行う
    if (event.nativeEvent.isComposing || event.keyCode === IME_KEY_CODE) return;
    // Shift + Enter は、改行（入力欄の標準の動作）。Enter だけで確定する
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      commitEdit(editing);
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit(editing);
    } else if (event.key === "Tab") {
      event.preventDefault();
    }
  };

  return (
    <>
      <svg
        className="mindmap"
        role="application"
        aria-label="マインドマップ"
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        onMouseDown={(event) => {
          // 何もない場所（ノード以外）を、左ボタンで押したら、ドラッグで表示位置を動かす
          if (event.button !== 0 || (event.target as Element).closest("g[data-node-id]")) return;
          startPan(event.clientX, event.clientY);
        }}
      >
        <rect x={view.x} y={view.y} width={view.width} height={view.height} fill={BACKGROUND} />
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
        {nodes.map((node) => (
          <NodeView
            key={node.id}
            map={laidOut}
            node={node}
            selected={node.id === selectedId}
            dropMode={dropTarget?.id === node.id ? dropTarget.mode : null}
            searchMatch={matchSet.has(node.id)}
            searchCurrent={node.id === currentMatch}
            editing={editing?.nodeId === node.id ? editing : null}
            inputRef={inputRef}
            onSelect={() => select(node.id)}
            onStartEdit={() => startEdit(node.id)}
            onDragStart={(x, y) => startDrag(node.id, x, y)}
            onDraftChange={(current, draft) => setEditing({ ...current, draft })}
            onInputKeyDown={onInputKeyDown}
            onInputBlur={(current) => editingRef.current !== null && commitEdit(current)}
          />
        ))}
      </svg>
      {Math.round(viewport.zoom * 100) !== 100 && (
        <div className="zoom-state">{Math.round(viewport.zoom * 100)}%</div>
      )}
      <div className="doc-state">
        {filePath === undefined ? "無題" : (filePath.split("/").pop() as string)}
        {dirty && " ● 未保存"}
      </div>
      {searchOpen && (
        <SearchBar
          query={searchQuery}
          onQueryChange={changeSearchQuery}
          matchCount={matches.length}
          currentIndex={searchIndex}
          onNext={() => moveSearch(1)}
          onPrevious={() => moveSearch(-1)}
          onClose={closeSearch}
          focusToken={searchFocusToken}
        />
      )}
      {panel === "help" && <ShortcutHelp onClose={() => closePanel("help")} />}
      {panel === "recent" && (
        <RecentFilesPanel
          files={recent.files}
          onSelect={(path) => void openPath(path)}
          onClose={() => closePanel("recent")}
        />
      )}
      {panel === "style" && (
        <StylePanel
          nodeId={selectedId}
          defaultColor={nodeTextStyle(map, map.nodes[selectedId]).color}
          nodeText={map.nodes[selectedId].text}
          style={map.nodes[selectedId].style ?? {}}
          icon={map.nodes[selectedId].icon}
          hasImage={map.nodes[selectedId].image !== undefined}
          onChange={changeStyle}
          onChangeIcon={changeIcon}
          onChooseImage={() => void chooseImage()}
          onRemoveImage={removeImage}
          onClose={() => closePanel("style")}
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
