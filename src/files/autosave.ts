import { invoke } from "@tauri-apps/api/core";
import { deserialize } from "../domain/deserialize";
import type { MindMap } from "../domain/mindmap";
import { serialize } from "../domain/serialize";

/** 復元できる自動保存の内容 */
export interface AutosaveSnapshot {
  map: MindMap;
  /** 編集していたファイル（まだ保存していなければ undefined） */
  filePath: string | undefined;
  /** 自動保存した時刻 */
  savedAt: Date;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 編集中のマップを、自動保存する（アプリのデータフォルダに、1つだけ保持する） */
export async function writeAutosave(
  map: MindMap,
  filePath: string | undefined,
  now: Date = new Date(),
): Promise<void> {
  const contents = JSON.stringify({
    savedAt: now.toISOString(),
    filePath: filePath ?? null,
    document: serialize(map),
  });
  try {
    await invoke("write_autosave", { contents });
  } catch (error) {
    throw new Error(`自動保存に失敗しました: ${errorMessage(error)}`);
  }
}

/** 保存された内容を、復元できる形に読む。壊れていて復元できないものは、null */
function parseSnapshot(contents: string): AutosaveSnapshot | null {
  try {
    const data: unknown = JSON.parse(contents);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
    const { savedAt, filePath, document } = data as Record<string, unknown>;
    if (typeof savedAt !== "string" || typeof document !== "string") return null;
    if (filePath !== null && typeof filePath !== "string") return null;
    const date = new Date(savedAt);
    if (Number.isNaN(date.getTime())) return null;
    return { map: deserialize(document), filePath: filePath ?? undefined, savedAt: date };
  } catch {
    return null;
  }
}

/** 自動保存を読み出す。なければ、または、壊れていて復元できなければ、null */
export async function readAutosave(): Promise<AutosaveSnapshot | null> {
  let contents: string | null;
  try {
    contents = await invoke<string | null>("read_autosave");
  } catch (error) {
    throw new Error(`自動保存を読み込めません: ${errorMessage(error)}`);
  }
  return contents === null ? null : parseSnapshot(contents);
}

/** 自動保存を削除する（保存した・破棄した・開き直したときに呼ぶ） */
export async function clearAutosave(): Promise<void> {
  try {
    await invoke("clear_autosave");
  } catch (error) {
    throw new Error(`自動保存を削除できません: ${errorMessage(error)}`);
  }
}
