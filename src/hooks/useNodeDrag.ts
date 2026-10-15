import { useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { record } from "../domain/history";
import type { History } from "../domain/history";
import type { MindMap, NodeId } from "../domain/mindmap";
import { canMoveTo, canReorderTo, dropNode } from "../domain/moveNode";
import { nudgeNodes } from "../domain/nodeOffset";
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

/** ドラッグ中のノードの、移動のずれ（マップの座標）。何もない場所の上にあるときだけ、ある */
export interface DragPreview {
  nodeId: NodeId;
  dx: number;
  dy: number;
}

export interface DropTarget {
  id: NodeId;
  mode: "child" | "reorder";
}

/**
 * ノードのドラッグ移動: 押したノードを、別のノードの上で離すと、そのノードの子につなぎ替える
 * （Shift を押して、兄弟の上で離すと、順序の入れ替え）。何もない場所で離すと、その分だけ、ノードと子孫を動かす
 * （手動配置。ドラッグ中は、preview で、動いた様子を見せる）。Escape で取り消す。
 *
 * @param mapRef 最新のマップ
 * @param scaleRef 画面上の 1px が、マップの座標で、どれだけかを返す関数
 */
export function useNodeDrag(
  mapRef: MutableRefObject<MindMap>,
  setHistory: Dispatch<SetStateAction<History<Snapshot>>>,
  scaleRef: MutableRefObject<() => number>,
) {
  const dragRef = useRef<Drag | null>(null);
  /** ドラッグ中に、離すとつなぎ替えられるノード（強調表示する） */
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  /** ドラッグ中の、ノードの移動のずれ（手動配置の予告） */
  const [preview, setPreview] = useState<DragPreview | null>(null);

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
      setPreview(null);
    };
    /** ドラッグの開始位置から、今のマウスの位置までの、移動量（マップの座標） */
    const deltaOf = (event: MouseEvent, drag: Drag) => {
      const scale = scaleRef.current();
      return { dx: (event.clientX - drag.startX) * scale, dy: (event.clientY - drag.startY) * scale };
    };

    const onMouseMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (drag === null) return;
      if (!drag.active) {
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <= DRAG_THRESHOLD) {
          return;
        }
        drag.active = true;
        // 押したノードが、複数選択に入っていれば、選択を保つ（一緒に動かす）。そうでなければ、そのノードだけを選ぶ
        setHistory((h) => {
          const all = [h.present.selectedId, ...(h.present.extraIds ?? [])];
          const extraIds = all.includes(drag.nodeId) ? all.filter((id) => id !== drag.nodeId) : undefined;
          return { ...h, present: { ...h.present, selectedId: drag.nodeId, extraIds } };
        });
      }
      const target = dropTargetAt(event, drag.nodeId);
      setDropTarget(target);
      // つなぎ替えの候補がなければ、何もない場所へ動かす（手動配置）ので、動いた様子を見せる
      setPreview(target === null ? { nodeId: drag.nodeId, ...deltaOf(event, drag) } : null);
    };
    const onMouseUp = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (drag === null) return;
      const target = drag.active ? dropTargetAt(event, drag.nodeId) : null;
      const { dx, dy } = deltaOf(event, drag);
      cancel();
      if (target !== null) {
        setHistory((h) =>
          record(h, {
            map: dropNode(h.present.map, drag.nodeId, target.id, target.mode),
            selectedId: drag.nodeId,
          }),
        );
      } else if (drag.active) {
        // 何もない場所で離したので、その分だけ動かす（複数選択していれば、選択したすべてを、一緒に）
        setHistory((h) => {
          const { selectedId, extraIds } = h.present;
          return record(h, {
            map: nudgeNodes(h.present.map, [selectedId, ...(extraIds ?? [])], dx, dy),
            selectedId,
            extraIds,
          });
        });
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
    preview,
    /** ノードを押した（ドラッグの候補にする）。マウスの位置を渡す */
    startDrag: (nodeId: NodeId, x: number, y: number) => {
      dragRef.current = { nodeId, startX: x, startY: y, active: false };
    },
  };
}
