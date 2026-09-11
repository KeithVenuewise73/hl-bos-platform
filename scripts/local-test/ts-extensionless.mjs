// Registers the resolver in ts-extensionless-hooks.mjs. Pass with
//   node --experimental-strip-types --import ./scripts/local-test/ts-extensionless.mjs
import { register } from "node:module";
register("./ts-extensionless-hooks.mjs", import.meta.url);
