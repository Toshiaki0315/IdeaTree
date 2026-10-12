/** 元に戻す／やり直すための、状態の履歴 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

/** 保持する履歴の最大件数（超えた分は古いものから捨てる） */
export const HISTORY_LIMIT = 100;

export function createHistory<T>(initial: T): History<T> {
  return { past: [], present: initial, future: [] };
}

/** 新しい状態を記録する。現在と同じ状態は記録せず、やり直しの履歴は破棄する */
export function record<T>(history: History<T>, next: T): History<T> {
  if (next === history.present) return history;
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
  };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

/** 直前の状態に戻る。戻れないときは同じ履歴を返す */
export function undo<T>(history: History<T>): History<T> {
  if (!canUndo(history)) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future],
  };
}
