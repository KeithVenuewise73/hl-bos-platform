/**
 * One photo through one provider: the pipeline step the app's queue runs.
 *
 *   provider.analyze()  ->  interpretReadings()  ->  analyzedStatus()
 *
 * Returns everything the store needs to write in one go. A provider that
 * throws produces no detections and no status here; the caller marks the
 * photo FAILED with the message, so it can be retried. Nothing is invented
 * to fill the gap.
 */

import type { ConfidenceThresholds } from "./confidence.ts";
import { interpretReadings } from "./context.ts";
import type { AnalysisImage, ImageAnalysisProvider } from "./provider/types.ts";
import { analyzedStatus } from "./review.ts";
import type { JerseyDetection, ProviderResult, RejectedReading } from "./types.ts";

export interface PhotoAnalysis {
  readonly provider: string;
  readonly providerModel: string;
  readonly athletesPresent: boolean | null;
  readonly athleteCount: number | null;
  readonly detections: JerseyDetection[];
  readonly rejected: RejectedReading[];
  readonly status: "completed" | "needs_review";
  readonly notes: string | null;
}

export async function analyzePhoto(
  provider: ImageAnalysisProvider,
  image: AnalysisImage,
  thresholds: ConfidenceThresholds,
): Promise<PhotoAnalysis> {
  const result: ProviderResult = await provider.analyze(image);
  const { detections, rejected } = interpretReadings(result.readings, {
    method: provider.info.method,
    ...(provider.info.understandsContext ? { unknownLocationCap: 1 } : {}),
  });
  const status = analyzedStatus(
    {
      detections: detections.map((d) => ({
        value: d.value,
        confidence: d.confidence,
        status: "suggested",
      })),
      athletesPresent: result.athletesPresent,
      noJerseyVisible: false,
      unusable: false,
      reviewed: false,
    },
    thresholds,
  );
  return {
    provider: provider.info.id,
    providerModel: provider.info.model,
    athletesPresent: result.athletesPresent,
    athleteCount: result.athleteCount,
    detections,
    rejected,
    status,
    notes: result.notes !== undefined && result.notes.length > 0 ? result.notes : null,
  };
}
