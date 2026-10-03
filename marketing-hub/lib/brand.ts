// Kinan brand, as on kinan.com.sa: white "كنان / kinan" logo on a charcoal header, a vivid orange accent with the
// chevron (‹ ›) motif, Montserrat set in light, letter-spaced capitals ("LIVE THE PLACE"), white pages and orange
// line accents. Used by the app header, the daily report / snapshot, the slide player and the demo kit.
// The real logo file goes in brand/kinan-logo.svg|png (see brand/README.md); until then a typographic lockup is used.
import { KINAN_LOGO } from "./brand-logo";

export const KINAN = {
  charcoal: "#1e1e1e", // header band
  orange: "#f15a29", // accent (chevrons, rules, highlights)
  orangeSoft: "#fde3d8",
  ink: "#1a1a1a",
  soft: "#6b6b6b",
  line: "#e6e6e6",
  paper: "#ffffff",
  page: "#f4f4f4",
  font: "Montserrat, 'IBM Plex Sans Arabic', 'Segoe UI', Helvetica, Arial, sans-serif",
  fontAr: "'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif",
  tagline: "LIVE THE PLACE",
  site: "www.kinan.com.sa",
  social: "kinanksa",
  fontsHref: "https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap",
};

/** The logo as HTML: the real file when present, else the two-line "كنان / kinan" lockup in white. */
export function kinanLogoHtml(height = 34, color = "#fff") {
  if (KINAN_LOGO) return `<img src="${KINAN_LOGO}" alt="Kinan" height="${height}" style="display:block;height:${height}px;width:auto;border:0${color !== "#fff" ? ";filter:invert(1)" : ""}">`;
  const ar = Math.round(height * 0.42), en = Math.round(height * 0.62);
  return `<div style="display:inline-block;color:${color};line-height:1;text-align:center"><div style="font-family:${KINAN.fontAr};font-weight:700;font-size:${ar}px;line-height:1.05">كنان</div><div style="font-family:${KINAN.font};font-weight:700;font-size:${en}px;letter-spacing:.01em;line-height:.95">kinan</div></div>`;
}

/** The orange chevron used on kinan.com.sa (‹ in LTR headers, › in RTL). */
export const chevron = (dir: "ltr" | "rtl", size = 30) => `<span style="display:inline-block;color:${KINAN.orange};font-family:${KINAN.font};font-weight:700;font-size:${size}px;line-height:1">${dir === "rtl" ? "›" : "‹"}</span>`;
