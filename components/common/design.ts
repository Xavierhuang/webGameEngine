/**
 * Shared design tokens. Kept in sync with lib/blockly/definitions.ts colors
 * so the marketing surface, the editor palette, and any block-colored UI in
 * the app all render from a single source of truth.
 */
export const PALETTE = {
  motion: '#4C97FF',
  looks: '#9966FF',
  sound: '#CF63CF',
  events: '#FFBF00',
  control: '#59C059',
  sensing: '#5CB1D6',
  operators: '#40BF4A',
  variables: '#FF8C1A',
  lists: '#FF661A',
  clones: '#B784E8',
  ai: '#FF6B35',
  myblocks: '#FF6680',
} as const;

/** Gradient orb backdrop used behind hero-like sections. Import as CSS. */
export const HERO_BACKDROP =
  'radial-gradient(ellipse 60% 50% at 20% 20%, rgba(76,151,255,0.18), transparent 60%),' +
  'radial-gradient(ellipse 60% 50% at 90% 30%, rgba(255,107,53,0.14), transparent 60%),' +
  'radial-gradient(ellipse 60% 50% at 50% 100%, rgba(153,102,255,0.12), transparent 60%)';
