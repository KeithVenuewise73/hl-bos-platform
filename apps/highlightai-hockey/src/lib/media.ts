/**
 * What a storage key is, in one place.
 *
 * The app and the vision service are separate processes that both touch the
 * same files, so they have to agree on how a file is named. They did not: the
 * app stored absolute paths and the service — correctly — refused them, because
 * a key it cannot contain inside its media root is a traversal waiting to
 * happen. The first real upload through the UI failed on exactly that, which is
 * what running the thing catches and reading it does not.
 *
 * The agreement is now explicit and lives here:
 *
 *   A storage key is a RELATIVE path under the shared media root.
 *   Neither side ever exchanges an absolute path.
 *
 * This module is pure so the containment rule can be tested without a
 * filesystem, and it is the only thing that turns a key into a path.
 */

import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

export class UnsafeStorageKey extends Error {
  constructor(key: string) {
    super(`Refusing a storage key that does not stay inside the media root: ${key}`);
    this.name = "UnsafeStorageKey";
  }
}

/** The key for a project's uploaded game video. */
export function originalKeyFor(projectId: string, extension: string): string {
  const ext = extension.toLowerCase() === ".mov" ? ".mov" : ".mp4";
  return `originals/${projectId}${ext}`;
}

/**
 * Turn a key into a path, or refuse.
 *
 * Refuses absolute keys, keys with null bytes, and anything that resolves
 * outside the root — checked by resolving both and comparing, rather than by
 * looking for ".." in the string, because "a/../../b" and "%2e%2e" and a
 * symlinked segment all defeat a string check.
 */
export function pathForKey(mediaRoot: string, key: string): string {
  if (key.length === 0 || key.includes("\0") || isAbsolute(key)) {
    throw new UnsafeStorageKey(key);
  }
  const root = resolve(mediaRoot);
  const candidate = resolve(root, normalize(key));
  const inside = relative(root, candidate);
  if (inside.length === 0 || inside.startsWith("..") || isAbsolute(inside)) {
    throw new UnsafeStorageKey(key);
  }
  return candidate;
}

/** The inverse, for a path already known to be under the root. */
export function keyForPath(mediaRoot: string, path: string): string {
  const inside = relative(resolve(mediaRoot), resolve(path));
  if (inside.startsWith("..") || isAbsolute(inside)) throw new UnsafeStorageKey(path);
  return inside.split(sep).join("/");
}

/** Where a key's containing directory is. */
export function dirForKey(mediaRoot: string, key: string): string {
  const path = pathForKey(mediaRoot, key);
  return join(path, "..");
}
