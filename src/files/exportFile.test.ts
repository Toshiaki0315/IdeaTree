import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addChild } from "../domain/addChild";
import { layout } from "../domain/layout";
import { createMindMap } from "../domain/mindmap";
import { toOutline } from "../domain/outline";
import { exportSvg } from "../domain/svgExport";
import { exportFile } from "./exportFile";
import { rasterizeSvg } from "./rasterize";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("./rasterize", () => ({ rasterizeSvg: vi.fn() }));

const mockedSave = vi.mocked(save);
const mockedInvoke = vi.mocked(invoke);
const mockedRasterize = vi.mocked(rasterizeSvg);

function sampleMap() {
  const base = createMindMap("アイデア");
  return addChild(base, base.rootId, "企画").map;
}

/** exportSvg の出力から、画像の大きさ（width と height の属性）を読む */
function svgSizeOf(map: ReturnType<typeof sampleMap>) {
  const svg = exportSvg(layout(map));
  const [, width, height] = /<svg [^>]*width="([\d.]+)" height="([\d.]+)"/.exec(svg)!;
  return { svg, width: Number(width), height: Number(height) };
}

const base64ToBytes = (data: string) => Uint8Array.from(atob(data), (c) => c.charCodeAt(0));

describe("exportFile（SVG・PNG・PDF での書き出し / Cmd+Shift+E）", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedInvoke.mockResolvedValue(undefined);
  });

  it("SVG・PNG・PDF・アウトラインのフィルタと、既定のファイル名を指定して、保存ダイアログを開く", async () => {
    mockedSave.mockResolvedValue(null);

    await exportFile(sampleMap());

    expect(mockedSave).toHaveBeenCalledWith({
      title: "書き出し",
      defaultPath: "IdeaTree.svg",
      filters: [
        { name: "SVG（ベクター画像）", extensions: ["svg"] },
        { name: "PNG（画像）", extensions: ["png"] },
        { name: "PDF", extensions: ["pdf"] },
        { name: "アウトライン（Markdown・テキスト）", extensions: ["md", "txt"] },
      ],
    });
  });

  it("ダイアログをキャンセルしたら、何も書き込まず null を返す", async () => {
    mockedSave.mockResolvedValue(null);

    expect(await exportFile(sampleMap())).toBeNull();
    expect(mockedInvoke).not.toHaveBeenCalled();
    expect(mockedRasterize).not.toHaveBeenCalled();
  });

  describe("SVG", () => {
    it(".svg なら、レイアウトを計算し直した SVG を、テキストとして書き込む", async () => {
      const map = sampleMap();
      mockedSave.mockResolvedValue("/Users/me/map.svg");

      const result = await exportFile(map);

      expect(mockedInvoke).toHaveBeenCalledWith("save_file", {
        path: "/Users/me/map.svg",
        contents: exportSvg(layout(map)),
      });
      expect(result).toBe("/Users/me/map.svg");
      expect(mockedRasterize).not.toHaveBeenCalled();
    });

    it("拡張子がない、または、知らない拡張子なら、SVG として、.svg を補う（大文字小文字は区別しない）", async () => {
      mockedSave.mockResolvedValueOnce("/Users/me/map");
      expect(await exportFile(sampleMap())).toBe("/Users/me/map.svg");

      mockedSave.mockResolvedValueOnce("/Users/me/map.docx");
      expect(await exportFile(sampleMap())).toBe("/Users/me/map.docx.svg");

      mockedSave.mockResolvedValueOnce("/Users/me/MAP.SVG");
      expect(await exportFile(sampleMap())).toBe("/Users/me/MAP.SVG");
    });
  });

  describe("アウトライン", () => {
    it.each([["/Users/me/map.md"], ["/Users/me/MAP.TXT"]])(
      "%s なら、Markdown のアウトラインを、テキストとして書き込む",
      async (path) => {
        const map = sampleMap();
        mockedSave.mockResolvedValue(path);

        const result = await exportFile(map);

        expect(mockedInvoke).toHaveBeenCalledWith("save_file", { path, contents: toOutline(map) });
        expect(result).toBe(path);
        expect(mockedRasterize).not.toHaveBeenCalled();
      },
    );
  });

  describe("PNG", () => {
    it(".png なら、SVG を画像にして、バイナリとして書き込む（大文字の拡張子も可）", async () => {
      const map = sampleMap();
      const { svg, width, height } = svgSizeOf(map);
      mockedSave.mockResolvedValue("/Users/me/map.PNG");
      mockedRasterize.mockResolvedValue({
        bytes: new Uint8Array([0x89, 0x50, 0xff, 0x00]),
        width: 1,
        height: 1,
      });

      const result = await exportFile(map);

      expect(mockedRasterize).toHaveBeenCalledWith(svg, width, height, "png");
      const [command, args] = mockedInvoke.mock.calls[0] as [string, { path: string; dataBase64: string }];
      expect(command).toBe("save_binary_file");
      expect(args.path).toBe("/Users/me/map.PNG");
      expect(base64ToBytes(args.dataBase64)).toEqual(new Uint8Array([0x89, 0x50, 0xff, 0x00]));
      expect(result).toBe("/Users/me/map.PNG");
    });
  });

  describe("PDF", () => {
    it(".pdf なら、SVG を JPEG 画像にして、1ページの PDF に載せて、バイナリとして書き込む", async () => {
      const map = sampleMap();
      const { svg, width, height } = svgSizeOf(map);
      const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x80, 0xff, 0xd9]);
      mockedSave.mockResolvedValue("/Users/me/map.pdf");
      mockedRasterize.mockResolvedValue({ bytes: jpeg, width: 2000, height: 1000 });

      const result = await exportFile(map);

      expect(mockedRasterize).toHaveBeenCalledWith(svg, width, height, "jpeg");
      const [command, args] = mockedInvoke.mock.calls[0] as [string, { path: string; dataBase64: string }];
      expect(command).toBe("save_binary_file");
      const bytes = base64ToBytes(args.dataBase64);
      const text = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
      expect(text.startsWith("%PDF-1.4")).toBe(true);
      expect(text).toContain("/Width 2000");
      expect(text).toContain("/Height 1000");
      expect(text).toContain(
        `stream\n${Array.from(jpeg, (b) => String.fromCharCode(b)).join("")}\nendstream`,
      );
      // ページの大きさは、画面の大きさ（96dpi の px）を、pt（72dpi）にしたもの
      expect(text).toContain(
        `/MediaBox [0 0 ${Number((width * 0.75).toFixed(2))} ${Number((height * 0.75).toFixed(2))}]`,
      );
      expect(result).toBe("/Users/me/map.pdf");
    });
  });

  describe("エラー", () => {
    it("書き込みに失敗したら、理由を含む日本語のエラーにする（文字列でも Error でも）", async () => {
      mockedSave.mockResolvedValue("/Users/me/map.svg");
      mockedInvoke.mockRejectedValueOnce("Permission denied");
      await expect(exportFile(sampleMap())).rejects.toThrow("書き出しに失敗しました: Permission denied");

      mockedInvoke.mockRejectedValueOnce(new Error("disk full"));
      await expect(exportFile(sampleMap())).rejects.toThrow("書き出しに失敗しました: disk full");
    });

    it("画像への変換に失敗したときも、同じ形のエラーにして、何も書き込まない", async () => {
      mockedSave.mockResolvedValue("/Users/me/map.png");
      mockedRasterize.mockRejectedValue(new Error("SVG を画像に変換できません"));

      await expect(exportFile(sampleMap())).rejects.toThrow(
        "書き出しに失敗しました: SVG を画像に変換できません",
      );
      expect(mockedInvoke).not.toHaveBeenCalled();
    });
  });

  it("元のマインドマップを変更しない", async () => {
    const map = sampleMap();
    const before = structuredClone(map);
    mockedSave.mockResolvedValue("/Users/me/map.svg");

    await exportFile(map);

    expect(map).toEqual(before);
  });
});
