import { openUrl } from "@tauri-apps/plugin-opener";
import { isLink } from "../domain/nodeNote";
import { errorMessage } from "./errorMessage";

/**
 * リンクを、既定のブラウザで開く。http・https の URL だけを開く（javascript: や file: などは、拒否する）。
 * Tauri 側の権限も、http・https に限っている（capabilities の opener:allow-open-url）。
 */
export async function openLink(url: string): Promise<void> {
  if (!isLink(url)) throw new Error("リンクは、http か https の URL にしてください");
  try {
    await openUrl(url);
  } catch (error) {
    throw new Error(`リンクを開けません: ${errorMessage(error)}`);
  }
}
