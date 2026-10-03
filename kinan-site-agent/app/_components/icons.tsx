/** Line icons in the style of Kinan's site graphics (1.7px strokes, rounded). */
import type { ReactElement } from "react";

const P: Record<string, ReactElement> = {
  map: <><path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5V4l-6 2.5L9 4z" /><path d="M9 4v13M15 6.5v13" /></>,
  chat: <><path d="M4 5h16v11H9l-5 4V5z" /><path d="M8 9.5h8M8 12.5h5" /></>,
  chart: <><path d="M4 20h16" /><path d="M6.5 16v-5M11 16V7M15.5 16v-7M20 16V4" /></>,
  folder: <><path d="M3 7.5V18a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-8l-2-2.5H4a1 1 0 0 0-1 1z" /></>,
  pin: <><path d="M12 21s-6.5-6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6" /></>,
  moon: <><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  camera: <><path d="M4 8h3l1.5-2.5h7L17 8h3v11H4V8z" /><circle cx="12" cy="13" r="3.5" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></>,
  speaker: <><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></>,
  file: <><path d="M6 3h8l4 4v14H6V3z" /><path d="M14 3v4h4" /></>,
  // document categories
  drawing: <><path d="M4 20 20 4" /><path d="M4 4h16v16H4z" /><path d="M8 4v3M12 4v2M16 4v3" /></>,
  spec: <><path d="M6 3h12v18H6z" /><path d="M9 8h6M9 11.5h6M9 15h4" /></>,
  rfi: <><circle cx="12" cy="12" r="8.5" /><path d="M9.8 9.5a2.3 2.3 0 1 1 3.2 2.1c-.7.3-1 .8-1 1.6v.3M12 16.6v.1" /></>,
  check: <><path d="M5 12.5 10 17l9-10" /></>,
  tool: <><path d="M14.5 5.5a4 4 0 0 0 4.9 4.9L11 18.8 7.2 15l8.4-8.4a4 4 0 0 0-1.1-1.1z" /><path d="M5 19l2.2-2.2" /></>,
  badge: <><rect x="4" y="5" width="16" height="14" rx="1.5" /><circle cx="9" cy="11" r="2" /><path d="M6.5 16c.6-1.4 1.5-2 2.5-2s1.9.6 2.5 2M14 10h3.5M14 13h3.5" /></>,
  helmet: <><path d="M4 16a8 8 0 0 1 16 0" /><path d="M3 16h18v2H3zM12 8v4" /></>,
  box: <><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" /></>,
  notes: <><path d="M6 3h12v18H6z" /><path d="M9 7.5h6M9 11h6M9 14.5h6" /></>,
  wrench: <><path d="M14 6a4 4 0 0 1 5 5l-9 9-3-3 9-9" /></>,
  coins: <><ellipse cx="12" cy="7" rx="7" ry="3" /><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /></>,
  photo: <><rect x="3.5" y="5" width="17" height="14" rx="1.5" /><circle cx="9" cy="10" r="1.8" /><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" /></>,
};

export function Icon({ name, className = "i" }: { name: keyof typeof P | string; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true">{P[name] ?? P.file}</svg>;
}

/** Brand mark: an orange chevron (Kinan's arrow motif), not the Kinan logo. */
export function Mark({ className = "mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 26 30" aria-hidden="true">
      <path d="M4 2.5 21 15 4 27.5" fill="none" stroke="#f26522" strokeWidth="6" strokeLinejoin="miter" strokeLinecap="butt" />
    </svg>
  );
}

export const CATEGORY_ICON: Record<string, string> = {
  Drawing: "drawing", Specification: "spec", RFI: "rfi", Inspection: "check", "Method Statement": "tool", Permit: "badge",
  HSE: "helmet", Submittal: "box", Minutes: "notes", "Snag List": "wrench", Variation: "coins", Photo: "photo", Other: "file",
};
