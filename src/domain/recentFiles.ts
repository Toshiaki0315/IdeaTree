/** 最近使ったファイル（パスと、開いた時刻） */
export interface RecentFile {
  path: string;
  /** 開いた（保存した）時刻（ISO 8601） */
  openedAt: string;
}

/** 覚えておくファイルの数 */
export const MAX_RECENT_FILES = 10;

/** ファイルを、一覧の先頭に加える（新しい順）。すでにあれば、移動して、時刻を更新する */
export function addRecentFile(list: RecentFile[], path: string, now: Date): RecentFile[] {
  return [{ path, openedAt: now.toISOString() }, ...list.filter((f) => f.path !== path)].slice(
    0,
    MAX_RECENT_FILES,
  );
}

/** ファイルを、一覧から外す（見つからないファイルを、取り除くときなどに使う） */
export function removeRecentFile(list: RecentFile[], path: string): RecentFile[] {
  return list.filter((f) => f.path !== path);
}

export function serializeRecentFiles(list: RecentFile[]): string {
  return JSON.stringify(list);
}

function isRecentFile(value: unknown): value is RecentFile {
  if (typeof value !== "object" || value === null) return false;
  const { path, openedAt } = value as Record<string, unknown>;
  return (
    typeof path === "string" &&
    path !== "" &&
    typeof openedAt === "string" &&
    !Number.isNaN(new Date(openedAt).getTime())
  );
}

/** 保存された一覧を読む。壊れていれば、空。不正な項目と、重複するパスは取り除き、上限に収める */
export function parseRecentFiles(text: string): RecentFile[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const seen = new Set<string>();
  const list: RecentFile[] = [];
  for (const item of data) {
    if (!isRecentFile(item) || seen.has(item.path)) continue;
    seen.add(item.path);
    list.push({ path: item.path, openedAt: item.openedAt });
  }
  return list.slice(0, MAX_RECENT_FILES);
}

/** 一覧に表示する、ファイル名（パスの最後の部分） */
export function recentFileName(path: string): string {
  return path.split("/").pop() as string;
}

/** 一覧に表示する、場所（親のフォルダ）。フォルダのないパスは、空 */
export function recentFileFolder(path: string): string {
  const index = path.lastIndexOf("/");
  if (index === -1) return "";
  return index === 0 ? "/" : path.slice(0, index);
}
