// Kinan brand, taken from Kinan's own collateral (the Malls corporate profile) and kinan.com.sa:
//   • pages are white / very light grey with a soft faceted architectural texture; the charcoal logo sits top-left and
//     the orange "›" chevron top-right; a small letter-spaced grey footer carries the page number in orange;
//   • headings are orange, semibold, uppercase; body text is charcoal; stat blocks are a small taupe caps label over a
//     big charcoal number with a thin rule; value lists use grey bars with an orange chevron notch;
//   • covers and dividers are full-bleed orange (white caps title) or charcoal with an orange diagonal chevron band;
//     the closing page is charcoal with the white logo centred and orange social icons + www.kinan.com.sa;
//   • the website header is charcoal with the white logo and the chevron; tagline "LIVE THE PLACE".
// Greta Arabic (the collateral's typeface) is commercial; Montserrat + IBM Plex Sans Arabic stand in for it.
// Assets (brand/kinan-logo.svg, kinan-chevron.svg, kinan-texture.jpg) are embedded by scripts/brand-logo.mjs.
import { KINAN_LOGO, KINAN_LOGO_PATH, KINAN_LOGO_VIEWBOX, KINAN_CHEVRON_PATH, KINAN_CHEVRON_VIEWBOX, KINAN_TEXTURE } from "./brand-logo";

export const KINAN = {
  charcoal: "#2e2e2f", // logo, dark panels, website header
  orange: "#f15a22", // accent (chevron, headings, rules, highlights)
  orangeDeep: "#de6436", // the chevron on dark covers
  orangeSoft: "#fde3d8",
  ink: "#2e2e2f",
  taupe: "#51473d", // stat-block labels, floor-plan dark
  beige: "#ddb885", // floor-plan light
  soft: "#6b6b6b",
  greyText: "#808285", // footer caps
  grey: "#bcbec0", // list bars
  line: "#e3e2df",
  paper: "#ffffff",
  page: "#f4f4f4",
  font: "Montserrat, 'IBM Plex Sans Arabic', 'Segoe UI', Helvetica, Arial, sans-serif",
  fontAr: "'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif",
  tagline: "LIVE THE PLACE",
  site: "www.kinan.com.sa",
  social: "kinanksa",
  fontsHref: "https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap",
  texture: KINAN_TEXTURE, // data URI of the faceted page texture (null without the file)
  hasLogo: !!KINAN_LOGO,
};

/** The logo as HTML in any colour: inline SVG from the real vector (so it is charcoal on light pages and white on dark),
 *  the bitmap when only a PNG is present, else the two-line "كنان / kinan" lockup. */
export function kinanLogoHtml(height = 34, color = "#fff") {
  if (KINAN_LOGO_PATH && KINAN_LOGO_VIEWBOX) {
    const [, , w, h] = KINAN_LOGO_VIEWBOX.split(/\s+/).map(Number);
    const width = Math.round((height * w) / h);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${KINAN_LOGO_VIEWBOX}" width="${width}" height="${height}" role="img" aria-label="Kinan" style="display:block;width:${width}px;height:${height}px"><path fill="${color}" d="${KINAN_LOGO_PATH}"/></svg>`;
  }
  if (KINAN_LOGO) return `<img src="${KINAN_LOGO}" alt="Kinan" height="${height}" style="display:block;height:${height}px;width:auto;border:0${color !== "#fff" ? ";filter:invert(1)" : ""}">`;
  const ar = Math.round(height * 0.42), en = Math.round(height * 0.62);
  return `<div style="display:inline-block;color:${color};line-height:1;text-align:center"><div style="font-family:${KINAN.fontAr};font-weight:700;font-size:${ar}px;line-height:1.05">كنان</div><div style="font-family:${KINAN.font};font-weight:700;font-size:${en}px;letter-spacing:.01em;line-height:.95">kinan</div></div>`;
}
/** The logo as an <img> with a data URI (for places that can't take inline SVG, e.g. e-mail where the SVG would be stripped anyway). */
export const kinanLogoSrc = KINAN_LOGO;

/** The orange chevron glyph from Kinan's collateral ("›" pointing forward: right in LTR, left in RTL), as inline SVG. */
export function chevron(dir: "ltr" | "rtl", size = 30, color = KINAN.orange) {
  if (KINAN_CHEVRON_PATH && KINAN_CHEVRON_VIEWBOX) {
    const [, , w, h] = KINAN_CHEVRON_VIEWBOX.split(/\s+/).map(Number);
    const width = Math.round((size * w) / h);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${KINAN_CHEVRON_VIEWBOX}" width="${width}" height="${size}" aria-hidden="true" style="display:inline-block;vertical-align:middle;width:${width}px;height:${size}px${dir === "rtl" ? ";transform:scaleX(-1)" : ""}"><path fill="${color}" d="${KINAN_CHEVRON_PATH}"/></svg>`;
  }
  return `<span style="display:inline-block;color:${color};font-family:${KINAN.font};font-weight:700;font-size:${size}px;line-height:1">${dir === "rtl" ? "‹" : "›"}</span>`;
}
/** The chevron as an SVG path in a 0 0 100 154 box (for React/SVG use). */
export const CHEVRON_PATH = KINAN_CHEVRON_PATH ? { d: KINAN_CHEVRON_PATH, viewBox: KINAN_CHEVRON_VIEWBOX! } : null;
export const LOGO_PATH = KINAN_LOGO_PATH ? { d: KINAN_LOGO_PATH, viewBox: KINAN_LOGO_VIEWBOX! } : null;
