import { useEffect, useRef, useState } from "react";
import { addRecentFile, removeRecentFile } from "../domain/recentFiles";
import type { RecentFile } from "../domain/recentFiles";
import { readRecentFiles, writeRecentFiles } from "../files/recent";

/**
 * 最近使ったファイルの一覧。起動時に読み込み（読み込めなければ、空のまま）、変わるたびに保存する。
 * 保存に失敗しても、使い続けられるので、無視する。保存は、順番に行う（古い内容が、後から書かれないように）。
 */
export function useRecentFiles() {
  const [files, setFiles] = useState<RecentFile[]>([]);
  /** 最新の一覧（読み込みや更新が重なっても、取りこぼさないよう、state とは別に持つ） */
  const latestRef = useRef<RecentFile[]>([]);
  /** 保存の順番待ち（前の保存が終わってから、次を始める） */
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());

  // 読み込みが終わる前に加えたファイルがあれば、それを先頭に残して、合わせる
  useEffect(() => {
    readRecentFiles()
      .then((list) => {
        const current = latestRef.current;
        const merged = [...current, ...list.filter((f) => !current.some((c) => c.path === f.path))];
        latestRef.current = merged;
        setFiles(merged);
      })
      .catch(() => {});
  }, []);

  const update = (change: (list: RecentFile[]) => RecentFile[]) => {
    const next = change(latestRef.current);
    latestRef.current = next;
    setFiles(next);
    writeChainRef.current = writeChainRef.current.then(() => writeRecentFiles(next)).catch(() => {});
  };

  return {
    files,
    /** ファイルを、一覧の先頭に加える */
    remember: (path: string) => update((list) => addRecentFile(list, path, new Date())),
    /** ファイルを、一覧から外す（開けなかったときなど） */
    forget: (path: string) => update((list) => removeRecentFile(list, path)),
  };
}
