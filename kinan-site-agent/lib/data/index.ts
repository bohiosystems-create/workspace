import type { ProjectData } from "../types";
import { SCHEDULE } from "./schedule";
import { REGISTER } from "./register";
import { REGULATIONS } from "./regulations";
import { INCIDENTS, PERMITS, PPE_MATRIX, RISKS, SAFETY_REQUIREMENTS, SAFETY_STATS } from "./safety";
import { DELIVERIES, PACKAGES, POS, REQUESTS, STOCK, SUPPLIERS } from "./procurement";
import { CONTACTS, NCRS } from "./people";
import { DATA_DATE } from "./util";

export function buildProjectData(): ProjectData {
  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  return clone({
    meta: {
      dataDate: DATA_DATE,
      disclaimer: "Demo dataset for Kinan Heights. Company, supplier and person names are fictional. Regulatory entries paraphrase requirements as applied to this project — verify against the current official texts before use.",
      currency: "SAR", contractValue: 2_680_000_000, startDate: "2025-03-01", completionDate: "2028-06-30",
    },
    schedule: SCHEDULE,
    register: REGISTER,
    regulations: REGULATIONS,
    safety: { requirements: SAFETY_REQUIREMENTS, risks: RISKS, permits: PERMITS, incidents: INCIDENTS, stats: SAFETY_STATS, ppeMatrix: PPE_MATRIX },
    procurement: { suppliers: SUPPLIERS, packages: PACKAGES, pos: POS, deliveries: DELIVERIES, requests: REQUESTS, stock: STOCK, source: "demo", lastSync: DATA_DATE + "T06:00:00Z" },
    quality: { ncrs: NCRS },
    contacts: CONTACTS,
  });
}
