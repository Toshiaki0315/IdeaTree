import { invoke } from "@tauri-apps/api/core";
import { parseRecentFiles, serializeRecentFiles } from "../domain/recentFiles";
import type { RecentFile } from "../domain/recentFiles";
import { errorMessage } from "./errorMessage";

/** 最近使ったファイルの一覧を読み込む（なければ、壊れていれば、空） */
export async function readRecentFiles(): Promise<RecentFile[]> {
  try {
    const contents = await invoke<string | null>("read_recent_files");
    return contents === null ? [] : parseRecentFiles(contents);
  } catch (error) {
    throw new Error(`最近使ったファイルを読み込めません: ${errorMessage(error)}`);
  }
}

/** 最近使ったファイルの一覧を保存する（アプリのデータフォルダ） */
export async function writeRecentFiles(list: RecentFile[]): Promise<void> {
  try {
    await invoke("write_recent_files", { contents: serializeRecentFiles(list) });
  } catch (error) {
    throw new Error(`最近使ったファイルを保存できません: ${errorMessage(error)}`);
  }
}
