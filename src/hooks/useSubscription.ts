import { useEffect } from "react";

/**
 * 非同期に登録するイベントの監視（Tauri のイベントなど）を、画面の表示中だけ有効にする。
 * 登録が終わる前に画面が閉じられたら、登録が終わってすぐに解除する。
 * Tauri の外では登録に失敗するが、監視できないだけなので、無視する。
 */
export function useSubscription(subscribe: () => Promise<() => void>): void {
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    subscribe()
      .then((fn) => (cancelled ? fn() : (unlisten = fn)))
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
    // 登録は、表示したときの一度だけ（最新の状態は、ref 経由で渡す）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
