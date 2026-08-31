/**
 * A stand-in for the `server-only` package under vitest.
 *
 * That package exists to make a build fail when server code is imported into a
 * client bundle. It has no runtime behaviour to test and it refuses to load
 * outside a Next build, so a unit test of a server module cannot import one
 * without this. The guarantee it provides is unaffected: the real package is
 * still what Next resolves, and this file is reachable only through the alias
 * in `vitest.config.ts`.
 */
export {};
