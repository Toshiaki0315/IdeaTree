import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, canRedo, canUndo, createHistory, record, redo, undo } from "./history";

/** 履歴に state1, state2, ... と順に記録する */
function recordAll<T>(initial: T, states: T[]) {
  return states.reduce(record, createHistory(initial));
}

describe("履歴（Undo / Cmd+Z）", () => {
  describe("createHistory", () => {
    it("初期状態だけを持つ履歴を作る。まだ Undo はできない", () => {
      const history = createHistory("初期");

      expect(history.present).toBe("初期");
      expect(history.past).toEqual([]);
      expect(history.future).toEqual([]);
      expect(canUndo(history)).toBe(false);
    });
  });

  describe("record（変更の記録）", () => {
    it("新しい状態を現在の状態にし、直前の状態を過去に積む", () => {
      const history = record(createHistory("A"), "B");

      expect(history.present).toBe("B");
      expect(history.past).toEqual(["A"]);
      expect(canUndo(history)).toBe(true);
    });

    it("現在と同じ状態（同一参照）は記録しない", () => {
      const state = { text: "A" };
      const history = createHistory(state);

      expect(record(history, state)).toBe(history);
    });

    it("元の履歴を変更しない（イミュータブル）", () => {
      const history = createHistory("A");

      record(history, "B");

      expect(history).toEqual({ past: [], present: "A", future: [] });
    });

    it("Undo した後に新しい変更を記録すると、やり直しの履歴は破棄される", () => {
      const undone = undo(recordAll("A", ["B", "C"]));
      expect(undone.future).toEqual(["C"]);

      const history = record(undone, "D");

      expect(history.present).toBe("D");
      expect(history.past).toEqual(["A", "B"]);
      expect(history.future).toEqual([]);
    });

    it(`履歴は最大 ${HISTORY_LIMIT} 件までで、古いものから捨てる`, () => {
      const states = Array.from({ length: HISTORY_LIMIT + 1 }, (_, i) => i + 1);

      let history = recordAll(0, states);
      expect(history.past).toHaveLength(HISTORY_LIMIT);

      for (let i = 0; i < HISTORY_LIMIT; i++) history = undo(history);

      expect(canUndo(history)).toBe(false);
      expect(history.present).toBe(1); // 最初の状態 0 は上限で捨てられている
    });
  });

  describe("undo（元に戻す）", () => {
    it("直前の状態に戻る", () => {
      const history = undo(recordAll("A", ["B"]));

      expect(history.present).toBe("A");
      expect(canUndo(history)).toBe(false);
    });

    it("複数回、順番にさかのぼれる", () => {
      let history = recordAll("A", ["B", "C", "D"]);

      history = undo(history);
      expect(history.present).toBe("C");
      history = undo(history);
      expect(history.present).toBe("B");
      history = undo(history);
      expect(history.present).toBe("A");
    });

    it("戻る前の状態を、やり直し（Redo）用に future へ残す", () => {
      let history = recordAll("A", ["B", "C"]);

      history = undo(history);
      expect(history.future).toEqual(["C"]);
      history = undo(history);
      expect(history.future).toEqual(["B", "C"]);
    });

    it("これ以上戻れないときは、同じ履歴をそのまま返す", () => {
      const history = createHistory("A");

      expect(undo(history)).toBe(history);
    });

    it("元の履歴を変更しない（イミュータブル）", () => {
      const history = recordAll("A", ["B"]);
      const before = structuredClone(history);

      undo(history);

      expect(history).toEqual(before);
    });
  });

  describe("canUndo", () => {
    it("過去があれば true、なければ false", () => {
      expect(canUndo(createHistory("A"))).toBe(false);
      expect(canUndo(recordAll("A", ["B"]))).toBe(true);
      expect(canUndo(undo(recordAll("A", ["B"])))).toBe(false);
    });
  });

  describe("redo（やり直し / Cmd+Shift+Z）", () => {
    it("Undo で戻った状態に、進み直す", () => {
      const history = redo(undo(recordAll("A", ["B"])));

      expect(history.present).toBe("B");
      expect(history.past).toEqual(["A"]);
      expect(history.future).toEqual([]);
    });

    it("複数回 Undo した後、同じ順序で進み直せる", () => {
      let history = undo(undo(undo(recordAll("A", ["B", "C", "D"]))));
      expect(history.present).toBe("A");

      history = redo(history);
      expect(history.present).toBe("B");
      history = redo(history);
      expect(history.present).toBe("C");
      history = redo(history);
      expect(history.present).toBe("D");
    });

    it("Redo した後に、もう一度 Undo できる（往復できる）", () => {
      const history = undo(redo(undo(recordAll("A", ["B"]))));

      expect(history.present).toBe("A");
      expect(history.future).toEqual(["B"]);
    });

    it("進み直せないときは、同じ履歴をそのまま返す", () => {
      const history = recordAll("A", ["B"]);

      expect(redo(history)).toBe(history);
    });

    it("新しい変更を記録した後は、Redo できない", () => {
      const history = record(undo(recordAll("A", ["B"])), "C");

      expect(redo(history)).toBe(history);
    });

    it("元の履歴を変更しない（イミュータブル）", () => {
      const history = undo(recordAll("A", ["B"]));
      const before = structuredClone(history);

      redo(history);

      expect(history).toEqual(before);
    });

    it("Redo で過去が増えても、上限を超えない", () => {
      const states = Array.from({ length: HISTORY_LIMIT + 1 }, (_, i) => i + 1);
      let history = recordAll(0, states);
      history = undo(history);

      history = redo(history);

      expect(history.past).toHaveLength(HISTORY_LIMIT);
      expect(history.present).toBe(HISTORY_LIMIT + 1);
    });
  });

  describe("canRedo", () => {
    it("やり直せる状態があれば true、なければ false", () => {
      const recorded = recordAll("A", ["B"]);

      expect(canRedo(createHistory("A"))).toBe(false);
      expect(canRedo(recorded)).toBe(false);
      expect(canRedo(undo(recorded))).toBe(true);
      expect(canRedo(redo(undo(recorded)))).toBe(false);
    });
  });
});
