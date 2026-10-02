# Client demo checklist — AI Director of Marketing

About 28 minutes. Every step and number below was rehearsed on the demo file in English and Arabic.

---

## A. The day before

- [ ] **Pick how you will run it**
  - **Demo file (recommended):** `marketing-hub-demo.html` at the repo root. One file, no install, works offline (only the fonts need internet). All data lives in the browser.
  - **Live app:** `cd marketing-hub && npm install && npm run demo:reset && npm run dev`, then open http://localhost:3001. Use this if you want to show the API endpoints or free-form chat with Claude.
- [ ] **Open it in Chrome or Edge**, window at least 1366 px wide (the menu then fits on one line).
- [ ] **Rehearse the storyline once** (section C), then reload the page to reset.
- [ ] **Optional — free-form chat:** in the live app, set `ANTHROPIC_API_KEY` in `.env`. Without it (and always in the demo file) the assistant uses built-in answers; stick to the question bank in section D.
- [ ] **Know the three things to say upfront** (section B).

## B. Say this upfront

1. **Sample data, frozen on 8 June 2026.** Vendors, campaigns, leads and invoices are realistic but invented. Reports are dated today, and their header says "Figures as of 8 Jun 2026".
2. **Integrations are simulated.** Outlook, Kinan's agent, Yardi and Oracle are in mock mode, and the screens say "simulated". Nothing is sent to anyone.
3. **One manager, no team.** The director does the team's work; you only approve. Nothing spends money or contacts a vendor or customer without your name on it.

## C. Storyline

### 0. Five minutes before

- [ ] Reload the demo file, so you start from a clean state.
- [ ] **Type your name in "Approving as"** on the Director page. Buttons stay disabled until a name is entered, and the browser remembers it.
- [ ] Language: English (switch to العربية in step 9).

### 1. Director — the morning view (3 min)

- [ ] Read the brief headline: **"Sales are at 81% of target year to date; Andalus Quarter is furthest behind (38%)."**
- [ ] Show the tiles: SAR 133.9M of SAR 165M, and the three projects (38% / 90% / 92%).
- [ ] Show the actual-vs-target chart: red months are below 90% of target.
- [ ] **Waiting for your decision: 9 items, about 50 min.** Point at the minutes; this is the manager's whole week.
- [ ] Click **Ask the director** and type *"What's today's brief?"*

### 2. Daily report — baseline (1 min)

- [ ] Go to **Reports** and click **Send now**. The report opens below.
- [ ] Show the schedule: 07:30 Riyadh, Sunday–Thursday, English and Arabic, internal addresses only.
- [ ] Say: *"Watch the 'since the last report' section later."*

### 3. Approve the June budget plan (3 min)

- [ ] On **Director**, go to **Budget plan**: total SAR 596K, about **+SAR 0.6M** extra sales, **SAR 62K** held in reserve.
- [ ] Explain the logic: money moves to the vendors that bring the most extra sales per riyal. The exiting vendor (Hajar) is halved, and Tasweeq is cut while it's being tested.
- [ ] Click **Approve plan and send to Kinan**. The Kinan feed shows `director.plan_approved` with your name.

### 4. Hand leads to Kinan's AI agent (3 min)

- [ ] Under **Delegations to Kinan's AI agent**, click **Approve and send to Kinan's agent (151)** on *"Follow up 151 leads that nobody contacted"*.
- [ ] Click **Simulate Kinan's reply** (demo only). Expect: **"90 leads contacted, 22 qualified or booked a viewing; 1 task closed."**
- [ ] Point out that a new task appeared, *"Follow up 61 leads…"*: the director keeps tracking what's left.

### 5. Orchestration — running the vendors (5 min)

- [ ] Open **Orchestration**. Show the four role cards: you, the director, vendors, Kinan's agent.
- [ ] **14 waiting**: 6 June briefs (drafted from the plan you just approved), 7 routine (5 lead-feedback emails and 2 reminders for late items), and 1 non-renewal notice.
- [ ] Open the **PropertyHub KSA** brief email: it's in **Arabic**, the vendor's language, with budget, campaign codes, targets and due dates.
- [ ] Tick **I have read the routine messages**, then click **Approve and send all routine**.
- [ ] Tick **I have read the briefs**, then click **Approve and send all briefs**.
- [ ] Show **With vendors — checked against the data**: each brief's checks (report due 5 Jul, creative due 15 Jun, spend check waiting for June data).
- [ ] In **What vendors owe us**, click **Mark received** on Sada Influence's late item. It becomes "Received late", feeds the on-time score, and its reminder closes.
- [ ] Explain escalation: two reminders, then the director asks *you* to call.
- [ ] Leave the **Hajar non-renewal notice** unapproved and say: *"A contract decision — I'd check the notice period first."*

### 6. The report shows what changed (2 min)

- [ ] **Reports**, then **Send now** again. In **"Since the last report"** expect:
  - Decisions waiting **9 → 7**
  - Leads nobody contacted **151 → 61**
  - Late vendor deliverables **2 → 1**
  - Work orders with vendors **0 → 7**
  - Overdue work orders **0 → 1**, in red (Nakhla's press release is still late after a reminder)
- [ ] Click **Download**: this is exactly the email the manager gets.

### 7. Meta — which agency runs each campaign (3 min)

- [ ] **Data Sources**, then scroll to **Meta ads — which agency runs each campaign** (or click the Meta item in the Director's inbox). Expect: **SAR 576.2K Meta spend, 8 campaigns, 92% attributed to an agency.**
- [ ] Show a clean one, *ASH-SEARCH-26 | Ash Shati…*: high confidence. The evidence is the code in its name, the utm on its ads, and that it was created by Layla Nasser of Tasweeq.
- [ ] Show the **red rows**:
  - *New campaign 14/05*: **Digital Wave Agency isn't one of your vendors** but has access to the ad account (SAR 8K). The agent flags it as urgent.
  - *Marina Tower | Corniche video views*: **conflicting evidence**. It carries Hajar Outdoor's code but was created by Tasweeq (SAR 33.6K). Choose **Hajar Outdoor → Confirm**: attributed rises to **98%**.
  - *Andalus | Retargeting*: no tracking codes, so the agent inferred the code from Tasweeq's other campaign in that account (medium confidence). It also drafts an email asking Tasweeq to add the codes.
- [ ] Ask the assistant *"Which agency runs each Meta campaign?"*

### 8. Who's worth renewing (3 min)

- [ ] **Decisions**: six vendors, each with a decision. For example, **Hajar Outdoor: exit** (high confidence) and **Tasweeq Digital: test a replacement**. Show the evidence and "what would change this".
- [ ] **Experiments**: the holdout test shows how much of a vendor's results it really caused.
- [ ] **Bench & Trials**: **Wasel Performance won its trial against Tasweeq Digital**. One click promotes it, and it gets budget in the next plan.

### 9. Ask the assistant (3 min)

- [ ] Use 3–4 questions from section D, for example *"Should we renew Hajar Outdoor?"*, *"Do vendor numbers match the CRM?"* and *"Any invoice problems?"*
- [ ] *"Draft an email to Tasweeq Digital"*, then pick an item: the draft appears for approval. Don't send it; show the approval controls instead.

### 10. Arabic (2 min)

- [ ] Click **العربية**: the whole app flips right-to-left.
- [ ] Ask *"ما موجز اليوم؟"* or *"ما الذي يدين به الموردون لنا؟"*
- [ ] **Reports** in Arabic, then **View** the Arabic report.

### 11. Close (2 min)

- [ ] Walk through the integration status table (section F) and the questions for Kinan (section G).

## D. Question bank (all tested)

**English**
- What's today's brief?
- What needs my approval?
- What do vendors owe us?
- What's the budget plan for June?
- When is my daily report?
- Which vendor converts best?
- Should we renew Hajar Outdoor?
- Do vendor numbers match the CRM?
- Any invoice problems?
- Which contracts are ending?
- What did we send to Kinan?
- How is Ash Shati Broker Push doing?
- What did the holdout test show?
- Draft an email to Tasweeq Digital
- What should I do first?
- Which agency runs each Meta campaign?
- Who created the Andalus retargeting campaign on Meta?

**العربية**
- ما موجز اليوم؟
- ما الذي ينتظر اعتمادي؟
- ما الذي يدين به الموردون لنا؟
- هل نجدد عقد هجر للإعلانات الخارجية؟
- متى يصلني التقرير اليومي؟
- أي مورد يحقق أفضل تحويل؟
- أي وكالة تدير كل حملة على ميتا؟

## E. Pitfalls and recovery

- **Reloading the demo file resets everything.** Don't reload mid-demo unless you want to start over. To reset the live app: `npm run demo:reset`, then restart.
- **Off-script questions in the demo file** may get a general answer (built-in answers, no AI). Say: *"With Claude connected it answers anything from this data."*
- **Buttons greyed out?** Your name isn't in "Approving as", or the "I have read" box isn't ticked.
- **Report dated today, figures from 8 June:** expected (sample data).
- **"Simulate Kinan's reply"** only exists in mock mode. Say that it's standing in for Kinan's agent.
- **No email is sent anywhere**, and the screens say "simulated".

## F. Integration status (for the close)

| Component | Status | Needed from the client |
|---|---|---|
| Kinan AI agent | Built; simulated in the demo | Webhook URL, shared secret, API key exchange |
| Yardi | Not built yet | Yardi interface licence, credentials, field mapping |
| Outlook | Built; not yet tested on their tenant | Entra app registration, sending mailbox |
| Oracle Fusion | Built (read-only); not yet tested on their instance | Oracle user and URL |
| Meta ads | Built; simulated in the demo; live mode not yet run on a real account | System-user token (`ads_read`, `business_management`), ad account IDs |
| Scheduler for daily reports | Built | A scheduler calling the endpoint every 15 minutes |
| Claude (free-form chat) | Built | Anthropic API key |

## G. Questions to ask (to move to a pilot)

1. Which Yardi product and version does Kinan run, and can we write activities and marketing sources into it?
2. Where is the campaign code captured on a lead in Yardi?
3. How does Kinan's AI agent want to receive tasks (webhook, queue, API)? Who approves on Kinan's side?
4. Do we need customer consent before Kinan's agent contacts lost leads?
5. What are the real monthly sales targets per project?
6. The vendor list, contracts (end dates, notice periods) and account-manager emails.
7. Oracle supplier numbers per vendor; access to Oracle Fusion.
8. Report recipients and the time they want the daily report.
9. Meta: which ad accounts exist, which Business Manager owns each, and which agencies have partner access. Will agencies adopt the naming and `utm_campaign` convention?
