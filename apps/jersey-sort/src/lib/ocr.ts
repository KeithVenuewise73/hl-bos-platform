/**
 * Local OCR provider: tesseract.js, on this machine, no key, no network.
 *
 * What it can and cannot do, stated plainly because the settings page says it
 * too:
 *   * It reads DIGITS. It does not see athletes, so `athletesPresent` is
 *     always null ("not determined") and every photo where it finds nothing
 *     goes to review rather than being declared empty.
 *   * It cannot tell a jersey from a scoreboard. Its readings carry
 *     `location: "unknown"`, so the context rules discount scoreboard and
 *     yard-marker positions and cap confidence inside the review band:
 *     local OCR never files a photo automatically.
 *   * On real action photos — motion blur, folds, angles — it misses many
 *     numbers a person can read. Claude vision is far better; this exists so
 *     the product works, honestly labelled, before a key is added.
 *
 * Method: the preview is binarised twice (bright-on-dark and dark-on-bright,
 * since jerseys come both ways), and each image is read in two page modes
 * (sparse text and single block). Readings are merged by number.
 */

import path from "node:path";

import engData from "@tesseract.js-data/eng";
import type {
  AnalysisImage,
  ImageAnalysisProvider,
  ProviderReading,
  ProviderResult,
} from "@hl-bos/jersey-sort";
import sharp from "sharp";
import { createWorker, PSM, type Worker } from "tesseract.js";

function langPath(): string {
  // The language data ships inside the npm package; nothing is downloaded.
  // Read from the package's own export (it is a server-external package, so
  // its path is the real one on disk, not a bundler module id).
  return path.join(path.dirname(engData.langPath), "4.0.0_best_int");
}

let workerPromise: Promise<Worker> | undefined;
let chain: Promise<unknown> = Promise.resolve();

async function worker(): Promise<Worker> {
  workerPromise ??= (async () => {
    const w = await createWorker("eng", 1, {
      langPath: langPath(),
      cacheMethod: "none",
      gzip: true,
    });
    await w.setParameters({ tessedit_char_whitelist: "0123456789" });
    return w;
  })();
  return workerPromise;
}

interface Word {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

async function read(w: Worker, image: Buffer, psm: PSM): Promise<Word[]> {
  await w.setParameters({ tessedit_pageseg_mode: psm });
  const result = await w.recognize(image, {}, { blocks: true });
  const words: Word[] = [];
  for (const block of result.data.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        for (const word of line.words)
          words.push({ text: word.text, confidence: word.confidence, bbox: word.bbox });
      }
    }
  }
  return words;
}

export function createLocalOcrProvider(): ImageAnalysisProvider {
  return {
    info: {
      id: "local-ocr",
      model: "tesseract.js-7/eng-best-int",
      label: "Local OCR (Tesseract, on this computer)",
      method: "ocr",
      understandsContext: false,
    },
    async analyze(image: AnalysisImage): Promise<ProviderResult> {
      // One tesseract worker, used by one photo at a time.
      const job = chain.then(async () => {
        const w = await worker();
        const width = 1200;
        const scaled = sharp(Buffer.from(image.bytes))
          .resize({ width, withoutEnlargement: false })
          .greyscale();
        const meta = await scaled.clone().png().toBuffer({ resolveWithObject: true });
        const h = meta.info.height;
        const variants = [
          await scaled.clone().threshold(190).png().toBuffer(),
          await scaled.clone().negate().threshold(190).png().toBuffer(),
        ];
        const readings: ProviderReading[] = [];
        for (const v of variants) {
          for (const psm of [PSM.SPARSE_TEXT, PSM.SINGLE_BLOCK]) {
            for (const word of await read(w, v, psm)) {
              const text = word.text.trim();
              if (!/^\d{1,4}$/.test(text)) continue;
              readings.push({
                text,
                confidence: Math.max(0, Math.min(1, word.confidence / 100)),
                location: "unknown",
                box: {
                  x: word.bbox.x0 / width,
                  y: word.bbox.y0 / h,
                  width: (word.bbox.x1 - word.bbox.x0) / width,
                  height: (word.bbox.y1 - word.bbox.y0) / h,
                },
              });
            }
          }
        }
        return {
          athletesPresent: null,
          athleteCount: null,
          readings,
          notes:
            "Read by local OCR, which cannot see athletes or tell a jersey from a sign.",
        };
      });
      chain = job.catch(() => undefined);
      return job;
    },
  };
}

/** Stop the tesseract worker (tests; the app keeps it for its lifetime). */
export async function shutdownLocalOcr(): Promise<void> {
  if (workerPromise === undefined) return;
  const w = await workerPromise;
  workerPromise = undefined;
  await w.terminate();
}
