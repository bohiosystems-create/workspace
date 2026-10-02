// Optional: the AI (task "draft", routed by lib/llm.ts) tightens the wording of a template draft. It may not add or
// change facts; anything unparseable falls back to the template. A human still reviews and approves every email.
import { runLlm } from "./llm";
import type { Polish } from "./recommendations";

const SYSTEM = `You edit business emails from a real-estate developer's marketing lead to an external marketing vendor. Improve clarity and tone (firm, professional, collaborative) of the draft you are given. Rules: keep EVERY figure, date, invoice number and campaign name exactly as in the facts; never add facts, promises, deadlines, payment commitments or threats that are not in the draft; keep it under 220 words; plain text only. Write in the SAME language as the draft (an Arabic draft stays Modern Standard Arabic with a formal business tone; do not translate and do not mix scripts, except for names that appear in Latin letters). Output the first line as "Subject: <subject>", then a blank line, then the body.`;

export const polishWithAI: Polish = async (draft, facts) => {
  const res = await runLlm({
    task: "draft", system: SYSTEM, maxTokens: 4000,
    messages: [{ role: "user", content: `FACTS (the only allowed content):\n${facts.map((f) => `- ${f}`).join("\n")}\n\nDRAFT:\nSubject: ${draft.subject}\n\n${draft.body}` }],
  });
  const m = res.text.match(/^Subject:\s*(.+)\n\s*\n([\s\S]+)$/);
  return m ? { subject: m[1].trim(), body: m[2].trim() } : null;
};
