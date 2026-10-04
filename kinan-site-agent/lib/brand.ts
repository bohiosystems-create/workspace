// Kinan brand, shared with the marketing assistant (marketing-hub/lib/brand.ts): taken from Kinan's collateral and
// kinan.com.sa — charcoal header band with the white logo and the orange chevron, white pages on a soft faceted
// texture, orange uppercase headings, taupe caps labels over big charcoal numbers, orange primary actions.
// Montserrat stands in for Kinan's Greta Arabic (commercial).
import { CHEVRON, LOGO, TEXTURE } from "./brand-assets";

export const KINAN = {
  charcoal: "#2e2e2f",
  orange: "#f15a22",
  orangeDeep: "#d94a16",
  orangeSoft: "#fde3d8",
  taupe: "#51473d",
  grey: "#bcbec0",
  line: "#e3e2df",
  page: "#f4f4f4",
  paper: "#ffffff",
  green: "#1f8a4c",
  alert: "#d03b3b",
  tagline: "LIVE THE PLACE",
  site: "www.kinan.com.sa",
};
export { CHEVRON, LOGO, TEXTURE };

/** Width of the logo / chevron artwork at a given height (keeps the vector's aspect). */
export function artWidth(art: { viewBox: string } | null, height: number) {
  if (!art) return height;
  const [, , w, h] = art.viewBox.split(/\s+/).map(Number);
  return Math.round((height * w) / h);
}

/** `<g>` transform that places the artwork's viewBox at (x, y) with the given height (for hand-built SVG strings). */
export function artTransform(art: { viewBox: string }, x: number, y: number, height: number) {
  const [vx, vy, , vh] = art.viewBox.split(/\s+/).map(Number);
  const s = height / vh;
  return `translate(${x} ${y}) scale(${s}) translate(${-vx} ${-vy})`;
}
