import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** 起動のときに、Finder から渡されて、溜まっていたファイルのパスを、取り出す */
export async function takePendingOpenFiles(): Promise<string[]> {
  const paths = await invoke<unknown[]>("take_pending_open_files");
  return paths.filter((path): path is string => typeof path === "string");
}

/**
 * アプリの起動中に、Finder から、ファイルを開くよう頼まれたときに、そのパスを、ハンドラに渡す。
 * 戻り値は、監視を解除する関数。
 */
export async function onOpenFileRequest(handler: (path: string) => void): Promise<() => void> {
  return listen<unknown>("open-file", (event) => {
    if (typeof event.payload === "string" && event.payload !== "") handler(event.payload);
  });
}
