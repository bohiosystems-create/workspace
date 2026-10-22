// Which edition of the app this build is. One source, two editions:
//   kinan    (default) — Kinan's own use cases: the building site (Kinan Heights), projects from documents, the daily
//                         brief, WhatsApp, construction proposals, Today. No facility operations.
//   vanilla             — every use case, for any client: construction and the operations layer for large
//                         infrastructure (power, desalination, airports) with the technicians' field app. Built by
//                         scripts/edition.mjs, which also swaps the Kinan brand for a neutral one.
// Set at build time (NEXT_PUBLIC_EDITION, inlined into the browser code too).
export type Edition = "kinan" | "vanilla";
export const EDITION: Edition = process.env.NEXT_PUBLIC_EDITION === "vanilla" ? "vanilla" : "kinan";
/** facility operations: the control rooms, the orchestrator for assets, the field app, the operations agent */
export const HAS_OPERATIONS = EDITION === "vanilla";
