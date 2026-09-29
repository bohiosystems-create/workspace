# Bohio agent on EstateMaster (demo)

A single-page demo of an AI agent that sits on top of ARGUS EstateMaster for KINAN's
Al Narjis Mixed-Use project. All data is dummy data.

## What's in this folder

| Path | What it is |
|---|---|
| `index.html` | The whole demo (model, agent, market data, Outlook inbox, WhatsApp mock-up, IC report). The dummy dataset and the Excel file are embedded. |
| `api/llm.js` | Vercel serverless function that proxies to Claude or OpenAI, so API keys stay on the server. |
| `vercel.json` | Vercel settings (function timeout, security headers). |
| `market-data.xlsx` | The dummy dataset as a workbook (also downloadable from inside the demo). |
| `data/` | Generator scripts for the dummy data (not deployed). |

## Deploy to Vercel

1. Unzip, then either:
   - **CLI:** `npm i -g vercel`, then run `vercel` inside the folder and follow the prompts; `vercel --prod` to publish; or
   - **Git:** push the folder to a GitHub repo and import it at vercel.com/new (framework preset: *Other*, no build command).
2. In the Vercel project, go to **Settings → Environment Variables** and add:

   | Variable | Needed for |
   |---|---|
   | `ANTHROPIC_API_KEY` | Claude engine |
   | `OPENAI_API_KEY` | OpenAI engine |
   | `DEMO_PASSWORD` | Optional but recommended: an access code people must enter before the demo can call the AI (stops strangers spending your credits) |
   | `ANTHROPIC_URL`, `OPENAI_URL` | Optional: a corporate gateway instead of the public endpoints |

3. Redeploy so the variables take effect. Open the site: the engine button (top right) switches to
   Claude automatically when a server key is set. If you set `DEMO_PASSWORD`, open the engine button
   and enter the access code.

Test locally with `vercel dev` (it reads a local `.env`).

## AI engines

- **Built-in:** offline, rule-based; works with no keys (also when you open `index.html` straight from disk).
- **Claude** (Anthropic Messages API) and **OpenAI** (Chat Completions API): same tools, sandbox and approval rules.
  Models are editable in the engine settings. Check the model name matches one your account can use.
- Without a server key you can paste a personal key in the engine settings; it goes straight from the
  browser to the provider. Fine for a private demo, not for production.

The proxy caps output at 2,000 tokens per call and never returns the key to the browser.
