import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addChild } from "../domain/addChild";
import { layout } from "../domain/layout";
import { createMindMap } from "../domain/mindmap";
import { exportSvg } from "../domain/svgExport";
import { svgExportFile } from "./svgExportFile";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));

const mockedSave = vi.mocked(save);
const mockedInvoke = vi.mocked(invoke);

/** レイアウト前のマップ（子ノードは親と同じ位置にある） */
function sampleMap() {
  const base = createMindMap("アイデア");
  const a = addChild(base, base.rootId, "企画");
  return addChild(a.map, base.rootId, "予算").map;
}

describe("svgExportFile（SVGエクスポート / Cmd+Shift+E）", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("SVGフィルタと既定のファイル名を指定して、保存ダイアログを開く", async () => {
    mockedSave.mockResolvedValue(null);

    await svgExportFile(sampleMap());

    expect(mockedSave).toHaveBeenCalledWith({
      title: "SVGとして書き出し",
      defaultPath: "IdeaTree.svg",
      filters: [{ name: "SVG", extensions: ["svg"] }],
    });
  });

  it("レイアウトを計算し直したSVGを、選ばれたパスへ書き込み、そのパスを返す", async () => {
    const map = sampleMap();
    mockedSave.mockResolvedValue("/Users/me/map.svg");
    mockedInvoke.mockResolvedValue(undefined);

    const result = await svgExportFile(map);

    expect(mockedInvoke).toHaveBeenCalledWith("save_file", {
      path: "/Users/me/map.svg",
      contents: exportSvg(layout(map)),
    });
    expect(result).toBe("/Users/me/map.svg");
  });

  it("書き出すSVGは、全ノードのテキストを含む完全なSVG文書である", async () => {
    mockedSave.mockResolvedValue("/Users/me/map.svg");
    mockedInvoke.mockResolvedValue(undefined);

    await svgExportFile(sampleMap());

    const contents = (mockedInvoke.mock.calls[0][1] as { contents: string }).contents;
    expect(contents).toMatch(/^<svg /);
    for (const text of ["アイデア", "企画", "予算"]) expect(contents).toContain(text);
  });

  it("拡張子が .svg でなければ補う（大文字小文字は区別しない）", async () => {
    mockedInvoke.mockResolvedValue(undefined);

    mockedSave.mockResolvedValueOnce("/Users/me/map");
    expect(await svgExportFile(sampleMap())).toBe("/Users/me/map.svg");

    mockedSave.mockResolvedValueOnce("/Users/me/MAP.SVG");
    expect(await svgExportFile(sampleMap())).toBe("/Users/me/MAP.SVG");
  });

  it("ダイアログをキャンセルしたら、何も書き込まず null を返す", async () => {
    mockedSave.mockResolvedValue(null);

    expect(await svgExportFile(sampleMap())).toBeNull();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("元のマインドマップを変更しない", async () => {
    const map = sampleMap();
    const before = structuredClone(map);
    mockedSave.mockResolvedValue("/Users/me/map.svg");
    mockedInvoke.mockResolvedValue(undefined);

    await svgExportFile(map);

    expect(map).toEqual(before);
  });

  describe("エラー", () => {
    beforeEach(() => {
      mockedSave.mockResolvedValue("/Users/me/map.svg");
    });

    it("書き込みに失敗したら、理由を含む日本語のエラーにする", async () => {
      mockedInvoke.mockRejectedValue("Permission denied");

      await expect(svgExportFile(sampleMap())).rejects.toThrow(
        "書き出しに失敗しました: Permission denied",
      );
    });

    it("Error オブジェクトで失敗した場合も、メッセージを含める", async () => {
      mockedInvoke.mockRejectedValue(new Error("disk full"));

      await expect(svgExportFile(sampleMap())).rejects.toThrow("書き出しに失敗しました: disk full");
    });
  });
});
