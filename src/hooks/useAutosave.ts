import { useEffect, useRef, useState } from "react";
import type { MindMap } from "../domain/mindmap";
import { clearAutosave, readAutosave, writeAutosave } from "../files/autosave";
import { confirmDiscard } from "../files/confirmDiscard";
import { confirmRestore } from "../files/confirmRestore";

/** 最後の変更から、自動保存するまでの待ち時間（ミリ秒） */
export const AUTOSAVE_DELAY_MS = 2000;

/** 変更を破棄して閉じることを選んだら、自動保存も削除する（次の起動で、復元を尋ねないように） */
export async function confirmDiscardAndClearAutosave(): Promise<boolean> {
  const discard = await confirmDiscard();
  if (discard) await clearAutosave().catch(() => {});
  return discard;
}

interface Options {
  map: MindMap;
  filePath: string | undefined;
  /** 保存していない変更があるか */
  dirty: boolean;
  /** 前回の自動保存を復元すると答えたときに、復元した内容を受け取る */
  onRestore: (saved: { map: MindMap; filePath: string | undefined }) => void;
}

/**
 * 自動保存。起動したら、前回の自動保存が残っていないか調べ、あれば、復元するかを尋ねる。
 * 確認が終わるまでは、自動保存の書き込みや削除をしない（残っている内容を、消してしまわないため）。
 * その後は、変更があれば、最後の変更から少し待って、自動保存する。変更なしに戻ったら、自動保存を削除する。
 * 戻り値は、起動時の確認が終わったか。
 */
export function useAutosave({ map, filePath, dirty, onRestore }: Options): boolean {
  const [ready, setReady] = useState(false);
  /** 自動保存のファイルが、今、ディスクにあるか（変更なしに戻ったときに、削除するかの判断に使う） */
  const onDiskRef = useRef(false);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

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
          onDiskRef.current = true;
          onRestoreRef.current(saved);
        } else {
          await clearAutosave().catch(() => {});
        }
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!dirty) {
      if (onDiskRef.current) {
        onDiskRef.current = false;
        clearAutosave().catch(() => {});
      }
      return;
    }
    const timer = setTimeout(() => {
      onDiskRef.current = true;
      writeAutosave(map, filePath).catch(() => {});
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ready, dirty, map, filePath]);

  return ready;
}
