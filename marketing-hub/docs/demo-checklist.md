# Client demo checklist — AI Director of Marketing

About 35 minutes. Every step and number below was rehearsed on the demo file in English and Arabic.

---

## A. The day before

- [ ] **Pick how you will run it**
  - **Demo file (recommended):** `marketing-hub-demo.html` at the repo root. One file, no install, works offline (only the fonts need internet). All data lives in the browser.
  - **Live app:** `cd marketing-hub && npm install && npm run demo:reset && npm run dev`, then open http://localhost:3001. Use this if you want to show the API endpoints or free-form AI chat (Claude or OpenAI).
- [ ] **Open it in Chrome or Edge**, window at least 1366 px wide (the menu then fits on one line).
- [ ] **Rehearse the storyline once** (section C), then reload the page to reset.
- [ ] **Optional — free-form AI chat:** in the live app, set `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` in `.env` (with both, the second takes over if the first fails). Without a key (and always in the demo file) the assistant uses built-in answers, which cover a wide range of questions (section D).
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
- [ ] **Waiting for your decision: 8 items, about 53 min.** Point at the minutes; this is the manager's whole week. One of them is **Daily campaign check: 14 open (2 urgent)**.
- [ ] Say: *"Leads, follow-up and sales are Kinan's own agent's job. The director reads the CRM results to judge the campaigns."*

### 2. Campaign recommendations in the brief (3 min)

- [ ] In the brief, **Campaign recommendations (22)**: today's daily campaign check first, then the rest. The first three are urgent:
  1. **CRM feed: almost no new leads for 8 days** (normal volume until 30 May). Say: *"The sample CRM data stops on 30 May. The director notices the feed went quiet and won't judge campaigns on missing data."*
  2. **Andalus — Off-plan Launch Funnel costs 8.5% of sales, 4.5× past digital campaigns** (SAR 297.5K spent for SAR 3.5M of sales in the last 3 months).
  3. **An agency that isn't one of your vendors is running Meta ads in your account** (Digital Wave Agency, SAR 8K).
- [ ] Each line has the reason and one action: **Open** (Daily check, Campaigns, Data Sources, Experiments) or **Draft email**.
- [ ] Click **Show all (22)**, then **Draft email** on *Tasweeq Digital: reported media spend not matched by the ad platforms* (SAR 58.4K). The assistant opens the draft for approval. Don't send it; show that nothing goes out without a name and the "I have read this" box.
- [ ] Click **Ask the director** and type *"What's today's brief?"* The campaign recommendations come back as cards.

### 2a. Daily campaign check (4 min)

- [ ] Open **Daily check**. KPIs: **14 recommendations, 2 urgent**. The day chips at the top show the last 7 days.
- [ ] Walk through **Andalus — Off-plan Launch Funnel**, which has four items: 8.5% cost to sales vs 1.9% for past digital campaigns; cost per qualified lead up 35% in May; spending ahead of plan (130% pacing); summer starts in 23 days.
- [ ] Open **Similar past campaigns** under an item: each past campaign's cost to sales and its lesson (e.g. Ash Shati Summer 2024 at 3.6%).
- [ ] Show **Ash Shati — Search & Social**: a winner (1.19%), so the advice is to trim only ~15% in July–August and scale up again in September, not cut.
- [ ] Click **Accept** on one item (optionally with a note): *Decided* goes to 1. Say: *"The decision carries over: the same item tomorrow keeps your decision. Accepting records it; the change itself happens on Campaigns or with the agency."*
- [ ] Click an earlier day chip to show the check as it was that morning, and **Resolved since yesterday** when something improves.
- [ ] Point at **AI second opinion**: with an Anthropic or OpenAI key, the AI reads the day's check with the history and says what to do first. (Not in the demo file.)

### 2b. Campaign history (2 min)

- [ ] Open **History**: **22 past campaigns** (2024–2025), SAR 8.2M spend, SAR 555.7M sales, **1.5% cost to sales**.
- [ ] Show the **lessons**: brokers and events convert best; Ramadan with a payment-plan offer worked; summer is the weakest season; radio and billboards cost the most per sale.
- [ ] Switch the benchmark tabs (channel, season, year, project, vendor) and expand a campaign to show its lesson.
- [ ] Say: *"This is the yardstick for every live campaign in the daily check, and the assistant can answer anything about it."*

### 3. Daily report — baseline (1 min)

- [ ] Go to **Reports** and click **Send now**. The report opens below.
- [ ] Show the **Campaign recommendations — 22 open, 3 urgent** section: what to change, why, and how ("apply in one click on Campaigns", "email drafted for your approval").
- [ ] Show the schedule: 07:30 Riyadh, Sunday–Thursday, English and Arabic, internal addresses only.

### 4. Approve the June budget plan (3 min)

- [ ] On **Director**, go to **Budget plan**: total SAR 596K, about **+SAR 0.6M** extra sales, **SAR 62K** held in reserve.
- [ ] Explain the logic: money moves to the vendors that bring the most extra sales per riyal. The exiting vendor (Hajar) is halved, and Tasweeq is cut while it's being tested.
- [ ] Click **Approve plan and send to Kinan**. Kinan's agent gets the plan and campaign codes as context.

### 5. Orchestration — running the vendors (5 min)

- [ ] Open **Orchestration**. Show the four role cards: you, the director, vendors, and Kinan's agent (owns leads and sales).
- [ ] **14 waiting**: 6 June briefs (drafted from the plan you just approved), 7 routine (5 lead-feedback emails and 2 reminders for late items), and 1 non-renewal notice.
- [ ] Open the **PropertyHub KSA** brief email: it's in **Arabic**, the vendor's language.
- [ ] Tick **I have read the routine messages**, then click **Approve and send all routine**.
- [ ] Tick **I have read the briefs**, then click **Approve and send all briefs**.
- [ ] In **What vendors owe us**, click **Mark received** on Sada Influence's late item. It becomes "Received late".
- [ ] Leave the **Hajar non-renewal notice** unapproved: a contract decision.

### 6. The report shows what changed (2 min)

- [ ] **Reports**, then **Send now** again. In **"Since the last report"** expect:
  - Decisions waiting **9 → 7** (9 because the email you drafted in step 2 joined the list)
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

- [ ] Use 4–5 questions from section D, for example *"What changed since yesterday?"*, *"How did Ramadan campaigns perform?"*, *"Compare 2024 and 2025"*, *"How much did we spend in March by project?"* and *"Should we renew Hajar Outdoor?"*
- [ ] Say: *"With an Anthropic or OpenAI key it answers anything from this data, in its own words, and shows which model answered."*
- [ ] *"Draft an email to Tasweeq Digital"*, then pick an item: the draft appears for approval. Don't send it; show the approval controls instead.

### 10. Arabic (2 min)

- [ ] Click **العربية**: the whole app flips right-to-left.
- [ ] Ask *"ما موجز اليوم؟"*, *"ما الجديد منذ الأمس؟"* or *"كيف كان أداء حملات رمضان؟"*
- [ ] Open **Daily check** in Arabic.
- [ ] **Reports** in Arabic, then **View** the Arabic report.

### 11. Close (2 min)

- [ ] Walk through the integration status table (section F) and the questions for Kinan (section G).

## D. Question bank (all tested; `npm run chat:eval` checks 92 questions)

**English**
- What's today's brief?
- What needs my approval?
- What should I change in the campaigns?
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
- What changed since yesterday?
- How is ASH-SEARCH-26 doing?
- Compare Tasweeq Digital and Hajar Outdoor
- Brokers vs influencers
- How much did we spend in March by project?
- Sales in Q1 2025 by project
- Compare 2024 and 2025
- What did we learn from past campaigns?
- How did Ramadan campaigns perform?
- Worst past campaigns
- Tell me about MAR-RAMADAN-25
- Tell me about Wajha Events (a past vendor)
- How is Andalus Quarter doing?
- How are influencers performing?
- What is cost to sales?
- Help

**العربية**
- ما موجز اليوم؟
- ما الذي ينتظر اعتمادي؟
- ماذا أغيّر في الحملات؟
- ما الذي يدين به الموردون لنا؟
- هل نجدد عقد هجر للإعلانات الخارجية؟
- متى يصلني التقرير اليومي؟
- أي مورد يحقق أفضل تحويل؟
- أي وكالة تدير كل حملة على ميتا؟
- ما الجديد منذ الأمس؟
- كيف كان أداء حملات رمضان؟
- قارن 2024 و 2025
- الإنفاق في مارس
- ما الدروس من الحملات السابقة؟
- كيف أداء الأندلس؟
- ما معنى نسبة التكلفة إلى المبيعات؟

## E. Pitfalls and recovery

- **Reloading the demo file resets everything.** Don't reload mid-demo unless you want to start over. To reset the live app: `npm run demo:reset`, then restart.
- **Off-script questions in the demo file** may get the general help answer (built-in answers, no AI). Say: *"With Claude or OpenAI connected it answers anything from this data."*
- **The CRM-feed alert is expected:** the sample CRM data ends on 30 May, and the clock is 8 June.
- **Buttons greyed out?** Your name isn't in "Approving as", or the "I have read" box isn't ticked.
- **Report dated today, figures from 8 June:** expected (sample data).
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
| AI: Anthropic (Claude) and OpenAI | Built, with failover; tested against mock servers | An Anthropic and/or OpenAI API key |

## G. Questions to ask (to move to a pilot)

1. Which Yardi product and version does Kinan run, and can we write activities and marketing sources into it?
2. Where is the campaign code captured on a lead in Yardi?
3. How does Kinan's AI agent want to receive tasks (webhook, queue, API)? Who approves on Kinan's side?
4. Does Kinan's agent want the plan, campaign changes and daily brief, and through what (webhook, queue, MCP)?
5. What are the real monthly sales targets per project?
6. The vendor list, contracts (end dates, notice periods) and account-manager emails.
7. Oracle supplier numbers per vendor; access to Oracle Fusion.
8. Report recipients and the time they want the daily report.
9. Meta: which ad accounts exist, which Business Manager owns each, and which agencies have partner access. Will agencies adopt the naming and `utm_campaign` convention?
