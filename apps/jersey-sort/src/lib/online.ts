import "server-only";

import { config } from "./config.ts";
import { db } from "./db.ts";
import {
  connect,
  newPublishProgress,
  onlineStatus,
  publishGallery,
  readPublisher,
  unpublishGallery,
  type ConnectResult,
  type PublishProgress,
} from "./online-core.ts";

/**
 * "Publish online", running in this server. Kept in memory like folder
 * imports (see imports.ts for why on globalThis): a restart stops a publish
 * part-way, and publishing again finishes it (what is online is skipped).
 */
const shared = globalThis as { __jerseysortPublishing?: Map<string, PublishProgress> };
const running = (shared.__jerseysortPublishing ??= new Map<string, PublishProgress>());

export function startPublish(org: string, galleryId: string): void {
  const current = running.get(galleryId);
  if (current !== undefined && !current.finished) return;
  const progress = newPublishProgress();
  running.set(galleryId, progress);
  void publishGallery(db(), config().dataDir, {
    org,
    galleryId,
    serviceUrl: config().galleryServiceUrl,
    fetch,
    progress,
  });
}

export function publishStatus(galleryId: string): PublishProgress | null {
  return running.get(galleryId) ?? null;
}

export function connectOnline(): Promise<ConnectResult> {
  return connect(config().galleryServiceUrl, config().dataDir, fetch);
}

export async function isConnected(): Promise<boolean> {
  return (await readPublisher(config().dataDir))?.connectedAt != null;
}

export function takeOffline(galleryId: string): Promise<void> {
  return unpublishGallery(db(), config().dataDir, {
    galleryId,
    serviceUrl: config().galleryServiceUrl,
    fetch,
  });
}

/**
 * After a change to a gallery that is already online (switched off, new
 * password, new link, games, name), publish again at once: switching a
 * gallery off here must switch it off on the website too, not at the next
 * time someone remembers to press Publish.
 */
export async function republishIfOnline(
  org: string,
  galleryId: string,
): Promise<boolean> {
  if (onlineStatus(db(), galleryId) === null || !(await isConnected())) return false;
  startPublish(org, galleryId);
  return true;
}
