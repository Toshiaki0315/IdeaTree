import { describe, expect, it } from "vitest";
import { bytesToBase64 } from "./base64";

describe("bytesToBase64", () => {
  it("空のバイト列は、空文字列", () => {
    expect(bytesToBase64(new Uint8Array())).toBe("");
  });

  it("標準の base64 に変換する（パディングあり）", () => {
    const text = (s: string) => bytesToBase64(new TextEncoder().encode(s));

    expect(text("Man")).toBe("TWFu");
    expect(text("Ma")).toBe("TWE=");
    expect(text("M")).toBe("TQ==");
  });

  it("UTF-8 として不正なバイトを含む、バイナリも、正しく変換できる", () => {
    expect(bytesToBase64(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00, 0xff]))).toBe("JVBERi0A/w==");
  });

  it("大きなバイト列（数百KB）も、エラーにならず、元に戻せる", () => {
    const bytes = Uint8Array.from({ length: 300_000 }, (_, i) => i % 256);

    const decoded = Uint8Array.from(atob(bytesToBase64(bytes)), (c) => c.charCodeAt(0));

    expect(decoded).toEqual(bytes);
  });
});
