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
import { LINE_HEIGHT_RATIO, labelBlock, lineCenters, wrapLabel } from "./domain/wrapLabel";
import { layout } from "./domain/layout";
import { createMindMap } from "./domain/mindmap";
import type { MindMap, NodeId, NodeStyle } from "./domain/mindmap";
import { setNodeIcon } from "./domain/nodeIcon";
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
  iconPlacement,
  iconTransform,
  imageBox,
  labelPosition,
  nodeLabel,
  nodeTextStyle,
  strokeWidthAt,
} from "./domain/svgExport";
import { documentOrder, revealNode, searchNodes } from "./domain/search";
import { updateText } from "./domain/updateText";
import { DEFAULT_VIEWPORT, panBy, panToInclude, visibleRect, zoomIn, zoomOut } from "./domain/viewport";
import type { Viewport } from "./domain/viewport";
import { visibleNodeIds } from "./domain/visibleNodeIds";
import { clearAutosave, readAutosave, writeAutosave } from "./files/autosave";
import { readClipboardText, writeClipboardText } from "./files/clipboard";
import { registerCloseGuard } from "./files/closeGuard";
import { confirmDiscard } from "./files/confirmDiscard";
import { confirmRestore } from "./files/confirmRestore";
import { exportFile } from "./files/exportFile";
import { loadFile, loadFileAt } from "./files/loadFile";
import { onOpenFileRequest, takePendingOpenFiles } from "./files/openRequests";
import { pickImage } from "./files/pickImage";
import { readRecentFiles, writeRecentFiles } from "./files/recent";
import { saveFile } from "./files/saveFile";
import { addRecentFile, removeRecentFile } from "./domain/recentFiles";
import type { RecentFile } from "./domain/recentFiles";
import { useSubscription } from "./hooks/useSubscription";
import NodeIcon from "./NodeIcon";
import RecentFilesPanel from "./RecentFilesPanel";
import SearchBar from "./SearchBar";
import ShortcutHelp from "./ShortcutHelp";
import StylePanel from "./StylePanel";

/** 画面の上に重ねて開くパネル */
type Panel = "style" | "help" | "search" | "recent";

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
/** 選択したノードが、見える範囲の端から、これより近いと、表示位置を動かす */
const FOLLOW_MARGIN = 40;
/** 最後の変更から、自動保存するまでの待ち時間（ミリ秒） */
const AUTOSAVE_DELAY_MS = 2000;

/** 折りたたまれているノードを展開する（子を追加・貼り付けしても、見えなくならないように） */
function expanded(map: MindMap, nodeId: NodeId): MindMap {
  return map.nodes[nodeId].collapsed ? toggleCollapse(map, nodeId) : map;
}

/** 日本語入力の変換中に、キーイベントに付く keyCode */
const IME_KEY_CODE = 229;

/** 編集中の入力欄の文字サイズ（App.css の .node-input と同じ） */
const EDITOR_FONT_SIZE = 16;

/** 編集中の入力欄の高さ（行数に合わせる） */
function editorHeight(draft: string): number {
  return Math.max(36, wrapLabel(draft, EDITOR_FONT_SIZE).length * EDITOR_FONT_SIZE * LINE_HEIGHT_RATIO + 16);
}

/** ラベルを中心にした、クリック範囲の長方形 */
function hitRect(centerX: number, centerY: number, label: string, fontSize: number) {
  const { width, height } = hitAreaSize(label, fontSize);
  return { x: centerX - width / 2, y: centerY - height / 2, width, height };
}

/** 変更を破棄して閉じることを選んだら、自動保存も削除する（次の起動で、復元を尋ねないように） */
async function confirmDiscardAndClearAutosave(): Promise<boolean> {
  const discard = await confirmDiscard();
  if (discard) await clearAutosave().catch(() => {});
  return discard;
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
  /** 開いているパネル（同時には、1つしか開かない） */
  const [panel, setPanel] = useState<Panel | null>(null);
  const searchOpen = panel === "search";
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchFocusToken, setSearchFocusToken] = useState(0);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const recentRef = useRef<RecentFile[]>([]);
  const dragRef = useRef<Drag | null>(null);
  /** ドラッグ中に、離すとつなぎ替えられるノード（強調表示する） */
  const [dropTarget, setDropTarget] = useState<{ id: NodeId; mode: "child" | "reorder" } | null>(null);
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

  // ノードのドラッグ移動: 押したノードを、別のノードの上で離すと、そのノードの子につなぎ替える
  useEffect(() => {
    /**
     * マウスの下にあるノードのうち、離したときに移動できるもの。
     * Shift を押していて、兄弟のノードなら、入れ替え（reorder）。そうでなければ、その子につなぎ替える（child）。
     */
    const dropTargetAt = (event: MouseEvent, nodeId: NodeId) => {
      // ウィンドウの外などで離したときは、ノードではない（target が要素でないことがある）
      const element = event.target instanceof Element ? event.target.closest("g[data-node-id]") : null;
      const id = element?.getAttribute("data-node-id");
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
      const pan = panRef.current;
      if (pan !== null) {
        // 内容を引いた向きと逆に、見ている範囲が動く
        const scale = unitsPerPixel();
        setViewport((v) => ({
          ...v,
          panX: pan.panX - (event.clientX - pan.startX) * scale,
          panY: pan.panY - (event.clientY - pan.startY) * scale,
        }));
        return;
      }
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
      panRef.current = null;
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

  // 起動したら、前回の自動保存が残っていないか調べ、あれば、復元するかを尋ねる。
  // 確認が終わるまでは、自動保存の書き込みや削除をしない（残っている内容を、消してしまわないため）
  const [autosaveReady, setAutosaveReady] = useState(false);
  /** 自動保存のファイルが、今、ディスクにあるか（変更なしに戻ったときに、削除するかの判断に使う） */
  const autosaveOnDiskRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 読み込めない（Tauri の外など）ときは、自動保存がないものとして、そのまま起動する
      const saved = await readAutosave().catch(() => null);
      // 画面が閉じられた（開発時の再描画など）ときは、二重に確認しない
      if (cancelled) return;
      if (saved !== null) {
        let restore: boolean;
        try {
          restore = await confirmRestore(saved.savedAt, saved.filePath);
        } catch {
          // 確認できなかったときは、残っている内容を守るため、自動保存を残し、この回は自動保存しない
          return;
        }
        if (restore) {
          // 復元した内容は、保存していない変更として扱う（保存すれば、変更なしになる）
          autosaveOnDiskRef.current = true;
          setHistory(createHistory({ map: saved.map, selectedId: saved.map.rootId }));
          setFilePath(saved.filePath);
          setMessage({ kind: "status", text: "前回の編集内容を復元しました" });
        } else {
          await clearAutosave().catch(() => {});
        }
      }
      setAutosaveReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 変更があれば、最後の変更から少し待って、自動保存する。変更なしに戻ったら、自動保存を削除する
  useEffect(() => {
    if (!autosaveReady) return;
    if (!dirty) {
      if (autosaveOnDiskRef.current) {
        autosaveOnDiskRef.current = false;
        clearAutosave().catch(() => {});
      }
      return;
    }
    const timer = setTimeout(() => {
      autosaveOnDiskRef.current = true;
      writeAutosave(map, filePath).catch(() => {});
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [autosaveReady, dirty, map, filePath]);

  // 最近使ったファイルの一覧を読み込む（読み込めなければ、空のまま）。
  // 読み込みが終わる前に加えたファイルがあれば、それを先頭に残して、合わせる
  useEffect(() => {
    readRecentFiles()
      .then((list) => {
        const current = recentRef.current;
        const merged = [...current, ...list.filter((f) => !current.some((c) => c.path === f.path))];
        recentRef.current = merged;
        setRecentFiles(merged);
      })
      .catch(() => {});
  }, []);

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

  // ズームとパン（表示だけの状態で、ファイルには保存しない）
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const view = visibleRect(half, viewport);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewWidthRef = useRef(view.width);
  viewWidthRef.current = view.width;
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  /** 画面上の1pxが、マップの座標で、どれだけか（画面の幅が分からないときは、1） */
  const unitsPerPixel = () => {
    const width = svgRef.current!.getBoundingClientRect().width;
    return width > 0 ? viewWidthRef.current / width : 1;
  };

  // 選択したノードが、見える範囲の外に出たら、そのノードが中心になるよう、表示位置を動かす
  useEffect(() => {
    const { position } = laidOut.nodes[selectedId];
    setViewport((v) => panToInclude(v, half, position, FOLLOW_MARGIN));
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ホイール: Ctrl（ピンチ）か Cmd を押していれば拡大・縮小、そうでなければ、表示位置を動かす
  useEffect(() => {
    const svg = svgRef.current!;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        setViewport((v) => (event.deltaY < 0 ? zoomIn(v) : zoomOut(v)));
      } else {
        const scale = unitsPerPixel();
        setViewport((v) => panBy(v, event.deltaX * scale, event.deltaY * scale));
      }
    };
    // 画面のスクロールを止めるため、passive にしない
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

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
      setMessage(errorMessage(error));
    }
  };

  /** 一覧を更新して保存する（保存に失敗しても、使い続けられるので、無視する） */
  const updateRecent = (update: (list: RecentFile[]) => RecentFile[]) => {
    const next = update(recentRef.current);
    recentRef.current = next;
    setRecentFiles(next);
    writeRecentFiles(next).catch(() => {});
  };
  const rememberRecent = (path: string) => updateRecent((list) => addRecentFile(list, path, new Date()));

  /** 保存する。saveAs が true なら保存先を決め直す（名前を付けて保存） */
  const save = (saveAs: boolean) =>
    runFileAction(async () => {
      const path = await saveFile(map, saveAs ? undefined : filePath);
      if (path !== null) {
        setFilePath(path);
        setSavedMap(map);
        rememberRecent(path);
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
    rememberRecent(loaded.path);
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
        updateRecent((list) => removeRecentFile(list, path));
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
          panRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            panX: viewport.panX,
            panY: viewport.panY,
          };
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
        {nodes.map((node) => {
          const isRoot = node.parentId === null;
          const look = nodeTextStyle(laidOut, node);
          // 中心ノードは、ノードの位置（画像があれば、その下）に、それ以外は、枝の中点にラベルを置く
          const labelX = isRoot ? node.position.x : labelPosition(laidOut, node).x;
          const labelY = isRoot ? centralLabelY(node) : labelPosition(laidOut, node).y;
          const labelLines = labelBlock(nodeLabel(node), look.fontSize).lines;
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
              data-search-match={matchSet.has(node.id) ? "true" : undefined}
              data-search-current={node.id === currentMatch ? "true" : undefined}
              onMouseDown={(event) => {
                // 左ボタンで、中心ノード以外を押したときだけ、ドラッグの候補にする（入力欄の操作は除く）
                if (event.button !== 0 || isRoot || event.target instanceof HTMLTextAreaElement) return;
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
                  {labelLines.length === 1
                    ? labelLines[0]
                    : labelLines.map((line, i) => (
                        <tspan
                          key={i}
                          x={labelX}
                          y={lineCenters(labelLines.length, look.fontSize, labelY)[i]}
                        >
                          {line}
                        </tspan>
                      ))}
                </text>
              )}
              {node.icon && (
                // アイコンは、IdeaTree のオリジナルの図形（24×24 の絵を、枠に収める）
                <g
                  data-icon-for={node.id}
                  data-icon={node.icon}
                  transform={iconTransform(iconPlacement(laidOut, node))}
                >
                  <NodeIcon id={node.icon} />
                </g>
              )}
              {isEditing && editing && (
                <foreignObject
                  x={labelX - 80}
                  y={labelY - editorHeight(editing.draft) / 2}
                  width={160}
                  height={editorHeight(editing.draft)}
                >
                  <textarea
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
          files={recentFiles}
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
