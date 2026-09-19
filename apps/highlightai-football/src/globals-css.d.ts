// Next.js compiles the stylesheet; TypeScript needs to be told the side-effect
// import is legitimate. Next normally generates this into next-env.d.ts, which
// is only written during `next dev`/`next build` — and `typecheck` must pass
// without having run a build first.
declare module "*.css";
