# Kinan demo — AI Director of Marketing

Everything you need to demo the AI Director of Marketing to Kinan.

| File | What it is |
|---|---|
| `1-OPEN-ME-demo.html` | **The demo.** One file: double-click it to open in Chrome or Edge. No install, no account, no internet needed (only the fonts load online). |
| `2-demo-kit-capabilities-and-checklist.html` | Capabilities, integration status and the demo checklist with tick-boxes (ticks are saved in your browser). |
| `docs/demo-checklist.md` | The same checklist as text, with the question bank and the recovery tips. |
| `docs/capabilities.md` | What the director does, the integration status, and the data sources that would sharpen its recommendations. |
| `docs/kinan-integration.md` | How the director and Kinan's agent exchange data, and the questions to settle with Kinan. |
| `app-source/` | The full application, to run it live (below). |

## Option 1 — the demo file (recommended)

1. Double-click **`1-OPEN-ME-demo.html`**. Use Chrome or Edge, with the window at least 1366 px wide.
2. Type your name in **Approving as** on the Director page.
3. Follow `2-demo-kit-capabilities-and-checklist.html` (about 35 minutes).

Reloading the page resets the demo to its starting state. All data is sample data frozen on **8 June 2026**; nothing is sent anywhere. The assistant uses its built-in answers (no AI key needed).

## Option 2 — the live app (to show free-form AI chat or the APIs)

Needs **Node.js 18.17 or newer** (the LTS from https://nodejs.org) and internet access for the install.

```bash
cd app-source
npm install
npm run demo:live    # resets the sample data, builds and starts — then open http://localhost:3001
```

- `npm run demo:live` takes about a minute; it is ready when it prints "Ready". The first page load then takes about 5 seconds while the sample data is created; after that pages open instantly.
- **Reset before the demo or after a rehearsal:** stop the app (Ctrl+C) and run `npm run demo:live` again. Don't delete the database while the app is running.
- **Free-form AI chat (optional):** `npm run demo:live` creates `app-source/.env` the first time. Set `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` in it, then run `npm run demo:live` again. With both keys, if one provider fails the other answers. Check with one free-form question: the answer shows "Claude · model" or "OpenAI · model" underneath. Without a key the assistant uses the same built-in answers as the demo file.
- Port 3001 busy? After `npm run demo:live` fails, run `npx next start -p 3002` and open http://localhost:3002.
- For development (pages compile on first visit, slower): `npm run setup`, then `npm run dev`.
- Windows: the commands are the same in PowerShell or Command Prompt.

## Say this upfront

1. **Sample data, frozen on 8 June 2026.** Realistic but invented vendors, campaigns, leads and invoices.
2. **Integrations are simulated** (Kinan's agent, Yardi, Outlook, Oracle, Meta), and the screens say so. Nothing is sent to anyone.
3. **One manager, no team.** The director does the team's work; the manager only approves. Leads, follow-up and sales stay with Kinan's own agent.
