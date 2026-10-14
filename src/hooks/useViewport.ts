import { useEffect, useRef, useState } from "react";
import type { Position } from "../domain/mindmap";
import { DEFAULT_VIEWPORT, panBy, panToInclude, visibleRect, zoomIn, zoomOut } from "../domain/viewport";
import type { Viewport } from "../domain/viewport";

/** 選択したノードが、見える範囲の端から、これより近いと、表示位置を動かす */
const FOLLOW_MARGIN = 40;

/**
 * ズームとパン（表示だけの状態で、ファイルには保存しない）。
 * ホイール（Ctrl・Cmd で拡大縮小、そうでなければ移動）、何もない場所のドラッグでの移動、
 * 選択したノードへの追従を扱う。
 *
 * @param half 拡大率 100% のとき、中心から見える距離
 * @param selectedId 選択しているノード（変わったら、見える位置に追従する）
 * @param selectedPosition 選択しているノードの位置
 */
export function useViewport(half: number, selectedId: string, selectedPosition: Position) {
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
    setViewport((v) => panToInclude(v, half, selectedPosition, FOLLOW_MARGIN));
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

  // 何もない場所のドラッグでの移動（マウスの動きと、離したことは、ウィンドウ全体で受ける）
  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const pan = panRef.current;
      if (pan === null) return;
      // 内容を引いた向きと逆に、見ている範囲が動く
      const scale = unitsPerPixel();
      setViewport((v) => ({
        ...v,
        panX: pan.panX - (event.clientX - pan.startX) * scale,
        panY: pan.panY - (event.clientY - pan.startY) * scale,
      }));
    };
    const onMouseUp = () => {
      panRef.current = null;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return {
    viewport,
    setViewport,
    /** SVG の viewBox にする、今見えている範囲 */
    view,
    svgRef,
    /** 画面上の 1px が、マップの座標で、どれだけか */
    unitsPerPixel,
    /** マウスの位置から、表示位置のドラッグを始める */
    startPan: (clientX: number, clientY: number) => {
      panRef.current = { startX: clientX, startY: clientY, panX: viewport.panX, panY: viewport.panY };
    },
  };
}
