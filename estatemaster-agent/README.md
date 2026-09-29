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

## Task routing (no engine choice)

Every request is routed automatically; the badge on each answer shows the route.

| Request | Route | AI model |
|---|---|---|
| Assumption changes, stress tests, sensitivities, headroom, explorer, capital structure | EstateMaster calculation | none |
| Zoning checks, Outlook, "why did X change" | Data query | none |
| Market benchmarking | Data query + commentary | fast (Claude Haiku 4.5 / gpt-5-mini) |
| IC report | EstateMaster numbers + narrative | deep (Claude Opus 5.5 / gpt-5) |
| Open questions, advice, Excel questions, multi-step requests | AI agent with tools | smart (Claude Sonnet 5.5 / gpt-5) |
| Approvals | Fixed rules, never AI | none |

AI never does the financial maths: the agent calls tools, and the tools return calculated numbers.
Connect Claude, OpenAI or both (server keys on Vercel, or paste keys under the Router button). With both,
a failure on one provider fails over to the other. With neither, the rules engine still answers.
Model names per tier can be overridden under Router → Routing rules and models, e.g. `openai.smart=gpt-5`.
Check the OpenAI model names match ones your account can use.

The proxy caps output at 2,000 tokens per call and never returns the key to the browser.

## Where the calculations happen

In production every return is calculated by EstateMaster itself: a Bohio runner (Windows VM with licensed
EstateMaster and Excel) writes the scenario into the model's live-linked inputs, lets EstateMaster
recalculate, and reads the outputs back. In this demo that runner is simulated in the browser by a
calibrated replica of the project's cash flows.
