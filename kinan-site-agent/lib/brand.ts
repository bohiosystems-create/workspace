// Kinan brand, shared with the marketing assistant (marketing-hub/lib/brand.ts): taken from Kinan's collateral and
// kinan.com.sa — charcoal header band with the white logo and the orange chevron, white pages on a soft faceted
// texture, orange uppercase headings, taupe caps labels over big charcoal numbers, orange primary actions.
// Typeface: Kinan's collateral is set in Greta Arabic / Greta Sans (Typotheque, licensed separately). When the
// licensed files are in brand/fonts/ they are embedded as the "Kinan" family; otherwise Fira Sans (a humanist sans
// of the same colour and proportions) and IBM Plex Sans Arabic stand in.
import { BRAND_FONT, CHEVRON, LOGO, TEXTURE } from "./brand-assets";

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
  /** the UI font stack (also used for canvas text so the 2D sheet, the 3D ground and the HUD match the UI) */
  font: '"Kinan","Fira Sans","IBM Plex Sans Arabic","Segoe UI",system-ui,-apple-system,Roboto,sans-serif',
  fontAr: '"Kinan","IBM Plex Sans Arabic","Noto Sans Arabic","Segoe UI",system-ui,sans-serif',
  brandFont: BRAND_FONT,
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
