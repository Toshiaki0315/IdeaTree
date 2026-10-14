import { describe, expect, it } from "vitest";
import { buildPdf } from "./pdf";

/** バイト列を、1バイト=1文字の文字列にする（バイナリを含む PDF を、検査するため） */
const latin1 = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join("");

// JPEG の先頭と末尾の印を持つ、バイナリのバイト列（UTF-8 として不正なバイトを含む）
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x80, 0x81, 0xfe, 0xff, 0xd9]);

function pdf(options: Partial<Parameters<typeof buildPdf>[0]> = {}) {
  return buildPdf({
    jpeg: JPEG,
    imageWidth: 1600,
    imageHeight: 1200,
    pageWidth: 800,
    pageHeight: 600,
    ...options,
  });
}

describe("buildPdf（JPEG 画像を 1 ページに載せた PDF の生成）", () => {
  it("PDF のヘッダで始まり、ファイルの終わりの印で終わる", () => {
    const text = latin1(pdf());

    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text.endsWith("%%EOF\n")).toBe(true);
  });

  it("ページの大きさ（MediaBox）は、指定した幅と高さ", () => {
    expect(latin1(pdf())).toContain("/MediaBox [0 0 800 600]");
    expect(latin1(pdf({ pageWidth: 595.28, pageHeight: 841.89 }))).toContain("/MediaBox [0 0 595.28 841.89]");
  });

  it("画像は、DCT（JPEG）の圧縮のまま、元のバイト列がそのまま埋め込まれる", () => {
    const bytes = pdf();
    const text = latin1(bytes);

    expect(text).toContain("/Subtype /Image");
    expect(text).toContain("/Width 1600");
    expect(text).toContain("/Height 1200");
    expect(text).toContain("/ColorSpace /DeviceRGB");
    expect(text).toContain("/BitsPerComponent 8");
    expect(text).toContain("/Filter /DCTDecode");
    expect(text).toContain(`/Length ${JPEG.length}`);
    expect(text).toContain(`stream\n${latin1(JPEG)}\nendstream`);
  });

  it("ページいっぱいに、画像を描く", () => {
    expect(latin1(pdf())).toContain("q 800 0 0 600 0 0 cm /Im0 Do Q");
    expect(latin1(pdf({ pageWidth: 100.5, pageHeight: 50 }))).toContain("q 100.5 0 0 50 0 0 cm /Im0 Do Q");
  });

  it("各オブジェクトの位置を示す相互参照表（xref）が正しく、startxref が xref を指す", () => {
    const bytes = pdf();
    const text = latin1(bytes);

    const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 9)).toBe("xref\n0 6\n");

    const entries = text.slice(startxref + 9, startxref + 9 + 6 * 20).match(/.{20}/g)!;
    expect(entries[0]).toBe("0000000000 65535 f \n");
    for (let n = 1; n <= 5; n++) {
      expect(entries[n]).toMatch(/^\d{10} 00000 n \n$/);
      const offset = Number(entries[n].slice(0, 10));
      expect(text.slice(offset, offset + `${n} 0 obj`.length)).toBe(`${n} 0 obj`);
    }
  });

  it("文書の構造（カタログ・ページ一覧・ページ）と、トレーラが正しい", () => {
    const text = latin1(pdf());

    expect(text).toContain("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj");
    expect(text).toContain("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj");
    expect(text).toContain("/Type /Page /Parent 2 0 R");
    expect(text).toContain("/Resources << /XObject << /Im0 4 0 R >> >>");
    expect(text).toContain("/Contents 5 0 R");
    expect(text).toContain("trailer\n<< /Size 6 /Root 1 0 R >>");
  });

  it("描画の命令（コンテンツストリーム）の長さが、実際の長さと一致する", () => {
    const text = latin1(pdf());
    const match = /5 0 obj\n<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/.exec(text)!;

    expect(Number(match[1])).toBe(match[2].length);
  });

  it("JPEG が空のとき、サイズが正でないときは、日本語のエラーにする", () => {
    expect(() => pdf({ jpeg: new Uint8Array() })).toThrow("JPEG のデータが空です");
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => pdf({ imageWidth: bad })).toThrow("画像やページの大きさが不正です");
      expect(() => pdf({ pageHeight: bad })).toThrow("画像やページの大きさが不正です");
    }
  });

  it("元の JPEG のバイト列を変更しない", () => {
    const copy = new Uint8Array(JPEG);

    pdf();

    expect(JPEG).toEqual(copy);
  });
});
