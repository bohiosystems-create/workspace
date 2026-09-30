import { SHAPES, SEED_LOCATIONS, LAYER_DEFS, PLAN, GEO } from "../lib/siteplan";
import { seedDb } from "../lib/seed";
import { renderDrawing } from "../lib/drawings";
const db = seedDb();
const drawings: Record<string, string> = {};
for (const d of db.docs) if (d.generated) drawings[d.id] = renderDrawing(d.generated.kind, d.generated.label, d.revision);
console.log(JSON.stringify({ shapes: SHAPES, plan: PLAN, geo: GEO, layers: LAYER_DEFS, db, drawings }));
