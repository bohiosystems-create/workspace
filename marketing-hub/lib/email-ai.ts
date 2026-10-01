import Anthropic from "@anthropic-ai/sdk";
import type { Polish } from "./recommendations";

const MODEL = "claude-opus-4-8";

// Optional: Claude tightens the wording of the template draft. It may not add or change facts;
// anything unparseable falls back to the template. A human still reviews and approves.
export const polishWithClaude: Polish = async (draft, facts) => {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 900,
    system: `You edit business emails from a real-estate developer's marketing lead to an external marketing vendor. Improve clarity and tone (firm, professional, collaborative) of the draft you are given. Rules: keep EVERY figure, date, invoice number and campaign name exactly as in the facts; never add facts, promises, deadlines, payment commitments or threats that are not in the draft; keep it under 220 words; plain text only. Write in the SAME language as the draft (an Arabic draft stays Modern Standard Arabic with a formal business tone; do not translate and do not mix scripts, except for names that appear in Latin letters). Output the first line as "Subject: <subject>", then a blank line, then the body.`,
    messages: [{ role: "user", content: `FACTS (the only allowed content):\n${facts.map((f) => `- ${f}`).join("\n")}\n\nDRAFT:\nSubject: ${draft.subject}\n\n${draft.body}` }],
  });
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
  const m = text.match(/^Subject:\s*(.+)\n\s*\n([\s\S]+)$/);
  return m ? { subject: m[1].trim(), body: m[2].trim() } : null;
};
