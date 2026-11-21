// Font stacks for inline styles, read from the theme being worn (--at-font-* tokens), so a page never names a font.
export const fontFamily = {
  sans: 'var(--at-font-sans)',
  display: 'var(--at-font-display)',
  mono: 'var(--at-font-mono)',
} as const;
