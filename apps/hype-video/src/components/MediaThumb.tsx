import type { MediaItem } from "@hl-bos/hype-video";

export function mediaUrl(projectId: string, item: MediaItem): string {
  return `/api/projects/${projectId}/media/${item.id}`;
}

export function MediaThumb({
  projectId,
  item,
  controls = false,
}: {
  projectId: string;
  item: MediaItem;
  controls?: boolean;
}) {
  const src = mediaUrl(projectId, item);
  // Plain <img>: these are private local files served by this app, so the
  // Next image optimiser (which would cache copies) is deliberately not used.
  return item.kind === "image" ? (
    <img src={src} alt={item.originalName} />
  ) : (
    <video src={src} controls={controls} muted playsInline preload="metadata" />
  );
}
