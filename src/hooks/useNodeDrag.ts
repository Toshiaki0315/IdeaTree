import { useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { record } from "../domain/history";
import type { History } from "../domain/history";
import type { MindMap, NodeId } from "../domain/mindmap";
import { canMoveTo, canReorderTo, dropNode } from "../domain/moveNode";
import type { Snapshot } from "../editorState";

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

export interface DropTarget {
  id: NodeId;
  mode: "child" | "reorder";
}

/**
 * ノードのドラッグ移動: 押したノードを、別のノードの上で離すと、そのノードの子につなぎ替える
 * （Shift を押して、兄弟の上で離すと、順序の入れ替え）。Escape で取り消す。
 *
 * @param mapRef 最新のマップ
 */
export function useNodeDrag(
  mapRef: MutableRefObject<MindMap>,
  setHistory: Dispatch<SetStateAction<History<Snapshot>>>,
) {
  const dragRef = useRef<Drag | null>(null);
  /** ドラッグ中に、離すとつなぎ替えられるノード（強調表示する） */
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  useEffect(() => {
    /**
     * マウスの下にあるノードのうち、離したときに移動できるもの。
     * Shift を押していて、兄弟のノードなら、入れ替え（reorder）。そうでなければ、その子につなぎ替える（child）。
     */
    const dropTargetAt = (event: MouseEvent, nodeId: NodeId): DropTarget | null => {
      // ウィンドウの外などで離したときは、ノードではない（target が要素でないことがある）
      const element = event.target instanceof Element ? event.target.closest("g[data-node-id]") : null;
      const id = element?.getAttribute("data-node-id");
      if (id === undefined || id === null) return null;
      if (event.shiftKey && canReorderTo(mapRef.current, nodeId, id)) {
        return { id, mode: "reorder" };
      }
      return canMoveTo(mapRef.current, nodeId, id) ? { id, mode: "child" } : null;
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
    // mapRef と setHistory は、変わらない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    dropTarget,
    /** ノードを押した（ドラッグの候補にする）。マウスの位置を渡す */
    startDrag: (nodeId: NodeId, x: number, y: number) => {
      dragRef.current = { nodeId, startX: x, startY: y, active: false };
    },
  };
}
