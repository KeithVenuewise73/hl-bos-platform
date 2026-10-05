export function Brand({ large = false }: { large?: boolean }) {
  return (
    <span
      className={`display flex items-center gap-2 ${large ? "text-3xl" : "text-lg"}`}
    >
      <span
        aria-hidden
        className={`grid place-items-center rounded bg-brand text-white ${large ? "h-10 w-10 text-xl" : "h-7 w-7 text-sm"}`}
      >
        #
      </span>
      <span>
        JerseySort <span className="text-brand">AI</span>
      </span>
    </span>
  );
}
