export type LocType =
  | "site" | "zone" | "building" | "level" | "room" | "yard" | "utility"
  | "gate" | "temp" | "crane" | "road" | "pin";

export interface Location {
  id: string;
  name: string;
  type: LocType;
  parentId?: string;
  /** Position on the site plan in plan units (pin / centre point). */
  x?: number;
  y?: number;
  /** Extra search words (e.g. "TC1", "crane 1"). */
  aliases?: string[];
}

export const CATEGORIES = [
  "Drawing", "Specification", "RFI", "Inspection", "Method Statement", "Permit",
  "HSE", "Submittal", "Minutes", "Snag List", "Variation", "Photo", "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Doc {
  id: string;
  title: string;
  category: Category;
  discipline?: string; // ARC / STR / MEP / CIV / HSE / QA ...
  revision?: string;
  locationId: string;
  pin?: { x: number; y: number }; // exact spot on the site plan
  filename: string;
  mime: string;
  size: number;
  summary: string;
  /** Searchable plain-text content (extracted or authored). */
  text: string;
  tags: string[];
  uploadedAt: string;
  uploadedBy: string;
  /** Seeded documents render a generated drawing instead of a stored file. */
  generated?: { kind: string; label: string };
}

export interface Note {
  id: string;
  docId?: string;
  locationId?: string;
  text: string;
  kind: "note" | "issue" | "instruction";
  status: "open" | "closed";
  author: string;
  createdAt: string;
  /** Normalised 0..1 point on the document (drawing markup). */
  at?: { x: number; y: number };
  via?: "agent" | "manual";
}

export interface Db {
  project: { name: string; client: string; code: string };
  locations: Location[];
  docs: Doc[];
  notes: Note[];
}

export type UiAction =
  | { type: "open_doc"; docId: string }
  | { type: "focus_location"; locationId: string };
