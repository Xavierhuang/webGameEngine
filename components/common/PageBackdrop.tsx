import { HERO_BACKDROP } from './design';

/**
 * Soft gradient-orb backdrop used behind hero-y sections. Absolute-positioned;
 * drop as a sibling to your page content wrapped in `relative overflow-hidden`.
 */
export function PageBackdrop() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 -z-10"
      style={{ background: HERO_BACKDROP }}
    />
  );
}
