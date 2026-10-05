declare module "heic-convert" {
  interface ConvertOptions {
    buffer: ArrayBufferLike | Uint8Array;
    format: "JPEG" | "PNG";
    quality?: number;
  }
  function convert(options: ConvertOptions): Promise<ArrayBuffer>;
  export default convert;
}

declare module "@tesseract.js-data/eng" {
  const data: { code: string; gzip: boolean; langPath: string };
  export default data;
}
