// The font allowlist. Keys and CSS stacks mirror sitegen.theme_fonts as seeded
// by migration 0060. A site spec stores only the KEY; the renderer resolves the
// stack here, so no spec can inject CSS through a font name.

export const FONT_STACKS = {
  sans_clean:
    'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif_classic: 'Georgia, "Times New Roman", Times, serif',
  sans_rounded:
    'ui-rounded, "Hiragino Maru Gothic ProN", "Segoe UI", system-ui, sans-serif',
  mono_workshop: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
  sans_condensed: '"Arial Narrow", "Helvetica Neue", Arial, sans-serif',
} as const;

export type FontKey = keyof typeof FONT_STACKS;

export const FONT_KEYS = Object.keys(FONT_STACKS) as [FontKey, ...FontKey[]];

export function isFontKey(v: unknown): v is FontKey {
  return typeof v === "string" && Object.hasOwn(FONT_STACKS, v);
}
