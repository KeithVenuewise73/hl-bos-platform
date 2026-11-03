import "server-only";

import { cookies } from "next/headers";

import { db } from "./db.ts";
import { accessCookie, visitorGallery, type PublicGallery } from "./repo/galleries.ts";

/** The team gallery this visitor has been let into, by link + password. */
export async function visitor(link: string): Promise<PublicGallery | undefined> {
  const jar = await cookies();
  return visitorGallery(db(), link, jar.get(accessCookie(link))?.value);
}
