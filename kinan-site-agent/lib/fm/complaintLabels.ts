// The complaint categories in words (a module of its own, so the screens can use it without the engine).
import type { ComplaintCategory } from "./types";

export const CATEGORY_LABEL: Record<ComplaintCategory, string> = {
  temperature: "Too hot / too cold", leak: "Leak / plumbing", lift_escalator: "Lift / escalator", lighting: "Lighting", cleaning: "Cleaning",
  odour: "Smell", noise: "Noise", power: "Power", baggage: "Baggage", access: "Doors / access", other: "Other",
};
