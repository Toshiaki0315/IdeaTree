export interface PdfOptions {
  jpeg: Uint8Array;
  imageWidth: number;
  imageHeight: number;
  pageWidth: number;
  pageHeight: number;
}

export function buildPdf(_options: PdfOptions): Uint8Array {
  throw new Error("未実装");
}
