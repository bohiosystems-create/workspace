// Request handlers for campaign ideation (shared by the API route and the offline demo).
import { ideasState, generateIdeas, decideIdea, GOALS, type Goal } from "./ideation";
import { type Lang, isLang, tx } from "./i18n";

export async function ideasAction(b: any) {
  const l: Lang = isLang(b.lang) ? b.lang : "en";
  let result: any = null;
  switch (b.action) {
    case "GENERATE": {
      const x = b.brief ?? {};
      result = await generateIdeas({
        project: x.project ? String(x.project) : undefined, month: x.month ? String(x.month) : undefined,
        budgetK: x.budgetK ? Number(x.budgetK) : undefined, goal: GOALS.includes(x.goal) ? (x.goal as Goal) : undefined,
        audience: x.audience ? String(x.audience).slice(0, 300) : undefined, notes: x.notes ? String(x.notes).slice(0, 600) : undefined,
        engine: x.engine === "rules" ? "rules" : "auto",
      }, l);
      break;
    }
    case "DECIDE": result = await decideIdea(String(b.id), b.decision, String(b.approver ?? ""), b.note ? String(b.note) : null, l); break;
    default: throw new Error(tx(l, "Unknown action.", "إجراء غير معروف."));
  }
  return { ...(await ideasState(l)), result };
}
export { ideasState };
