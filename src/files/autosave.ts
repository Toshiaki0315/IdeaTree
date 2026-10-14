import type { MindMap } from "../domain/mindmap";

export interface AutosaveSnapshot {
  map: MindMap;
  filePath: string | undefined;
  savedAt: Date;
}

export async function writeAutosave(_map: MindMap, _filePath: string | undefined, _now?: Date): Promise<void> {
  throw new Error("未実装");
}

export async function readAutosave(): Promise<AutosaveSnapshot | null> {
  throw new Error("未実装");
}

export async function clearAutosave(): Promise<void> {
  throw new Error("未実装");
}
