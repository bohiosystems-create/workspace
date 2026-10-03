# Client demo checklist — AI Assistant Director of Marketing

About 40 minutes. Every step and number below was rehearsed on the demo file in English and Arabic.

---

## A. The day before

- [ ] **Get the package:** unzip `kinan-demo.zip`. Start with `START-HERE.md`.
- [ ] **Pick how you will run it**
  - **Demo file (recommended):** double-click `1-OPEN-ME-demo.html`. One file, no install, works offline (only the fonts need internet). All data lives in the browser.
  - **Claude app edition:** open the claude.ai link in the Claude app (web, desktop or mobile). The same demo, but the assistant, the daily second opinion and campaign ideas are answered by Claude through your own Claude account, with no API key. Allow it when the Claude app asks (if you decline, answers come from the built-in rules and the footnote under each answer says so; reopen the page to be asked again). Each answer shows "Claude · Claude (your Claude account)" when Claude answered. Use this to show free-form AI without setting anything up.
  - **Live app:** needs Node.js 18.17+. In `app-source/`: `npm install`, then `npm run demo:live` (resets the sample data, builds and starts), then open http://localhost:3001. Use this to show the APIs, or free-form AI with your own Claude, OpenAI or Gemini keys.
- [ ] **Open it in Chrome or Edge**, window at least 1366 px wide (the menu then fits on one line).
- [ ] **Rehearse the storyline once** (section C), then reset: reload the demo file, or in the live app stop it (Ctrl+C) and run `npm run demo:live` again.
- [ ] **Optional — free-form AI chat (live app only):** set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and/or `GEMINI_API_KEY` in `app-source/.env` and run `npm run demo:live` again. With two or more, each task goes to its preferred provider and the next takes over if one fails. Ask one free-form question in rehearsal to check the key works; the answer shows the provider and model underneath (e.g. "Claude · claude-opus-5-5"). Without a key the assistant uses built-in answers, which cover a wide range of questions (section D).
- [ ] **Keep `2-demo-kit-capabilities-and-checklist.html` open** on a second screen or tab: the same checklist with tick-boxes.
- [ ] **Know the three things to say upfront** (section B).

## B. Say this upfront

1. **Sample data, frozen on 8 June 2026.** Vendors, campaigns, leads and invoices are realistic but invented. Reports and the brief carry today's real date; their figures are labelled "as of 8 Jun 2026".
2. **Integrations are simulated.** Outlook, Yardi and Oracle are in mock mode, and the screens say "simulated". Nothing is sent to anyone.
3. **One manager, no team.** The director does the team's work; you only approve. Nothing spends money or contacts a vendor or customer without your name on it.

## C. Storyline

### 0. Five minutes before

- [ ] Reset to a clean state: reload the demo file (live app: Ctrl+C, then `npm run demo:live`).
- [ ] **Type your name in "Approving as"** on the Director page. Buttons stay disabled until a name is entered, and the browser remembers it.
- [ ] Language: English (switch to العربية in step 13).

### 1. Director — the morning view (3 min)

- [ ] Read the brief headline: **"Sales are at 81% of target year to date; Andalus Quarter is furthest behind (38%)."**
- [ ] Show the tiles: SAR 133.9M of SAR 165M, and the three projects (38% / 90% / 92%).
- [ ] In the brief, point at the **Data scan** line: *7 sources checked (CRM 3, email 5, invoices 1, ad platforms 1, competitors 3, market 3, calendar 3) — 8 need an answer*. Scroll to **What the data shows today**: each finding has a tiny 12-week trend bar, the evidence from other sources under it (↳ Email: PropertyHub — featured slot ended 10 May), and the initiative that answers it.
- [ ] **Waiting for your decision: 8 items, about 54 min.** Point at the minutes; this is the manager's whole week. One of them is **Daily campaign check: 15 open (2 urgent)**.
- [ ] Say: *"Leads, follow-up and sales are Kinan's own agent's job. The director reads the CRM results to judge the campaigns."*

### 2. Campaign recommendations in the brief (3 min)

- [ ] In the brief, **Campaign recommendations (22)**: today's daily campaign check first, then the rest. The first three are urgent:
  1. **CRM feed: almost no new leads for 8 days** (normal volume until 30 May). Say: *"The sample CRM data stops on 30 May. The director notices the feed went quiet and won't judge campaigns on missing data."*
  2. **Andalus — Off-plan Launch Funnel costs 8.5% of sales, 4.5× past digital campaigns** (SAR 297.5K spent for SAR 3.5M of sales in the last 3 months).
  3. **An agency that isn't one of your vendors is running Meta ads in your account** (Digital Wave Agency, SAR 8K).
- [ ] Each line has the reason and one action: **Open** (Daily check, Campaigns, Experiments) or **Draft email**.
- [ ] Click **Show all (22)**, then **Draft email** on *Tasweeq Digital: reported media spend not matched by the ad platforms* (SAR 58.4K). The assistant opens the draft for approval. Don't send it; show that nothing goes out without a name and the "I have read this" box.
- [ ] Click **Ask the director** and type *"What's today's brief?"* The campaign recommendations come back as cards.

### 3. Daily campaign check (4 min)

- [ ] Open **Daily check**. KPIs: **15 recommendations, 2 urgent**. One of them: **Marina Tower — Retail & Residential Spotlight: leads down 49% this week** (the portal slot lapsed). The day chips at the top show the last 7 days.
- [ ] Walk through **Andalus — Off-plan Launch Funnel**, which has four items: 8.5% cost to sales vs 1.9% for past digital campaigns; cost per qualified lead up 35% in May; spending ahead of plan (130% pacing); summer starts in 23 days.
- [ ] Open **Similar past campaigns** under an item: each past campaign's cost to sales and its lesson (e.g. Ash Shati Summer 2024 at 3.6%).
- [ ] Show **Ash Shati — Search & Social**: a winner (1.19%), so the advice is to trim only ~15% in July–August and scale up again in September, not cut.
- [ ] Click **Accept** on one item (optionally with a note): *Decided* goes to 1. Say: *"The decision carries over: the same item tomorrow keeps your decision. Accepting records it; the change itself happens on Campaigns or with the agency."*
- [ ] Click an earlier day chip to show the check as it was that morning, and **Resolved since yesterday** when something improves.
- [ ] Point at **AI second opinion**: with a Claude, OpenAI or Gemini key (or in the Claude app edition), the AI reads the day's check with the history and says what to do first. (Not in the demo file.)

### 4. Campaign history (2 min)

- [ ] The campaign history isn't a menu page: it sits in the assistant's context. Open **Ask** and type *"What does our campaign history teach us?"* — **43 past campaigns** (2023–2025, including Palm Villas, sold out in 2024, and three Cityscape stands), SAR 14.8M spend, SAR 1,014.4M sales, **1.5% cost to sales**, and the lessons: brokers and events convert best; Ramadan with a payment-plan offer worked; summer is the weakest season; radio and billboards cost the most per sale.
- [ ] Follow up: *"Chart cost to sales by season"*, *"List the 2024 campaigns"*, *"How did Palm Villas Ramadan do?"*
- [ ] Say: *"This is the yardstick for every live campaign in the daily check, and you can ask the assistant anything about it."*

### 5. Daily report — baseline (1 min)

- [ ] Go to **Reports** and click **Preview today's report**. The daily report opens below. Then click **Run snapshot** for the live version: headline figures, charts including Meta revenue, today's campaign check (saved in History, not emailed).
- [ ] Scroll through the charts:
  - **Sales vs target**: Andalus 38% in red; Ash Shati 90% and Marina 92% in amber.
  - **At a glance**: sales by month (May SAR 32.8M, the best month); revenue by vendor (Mubasher 38%, Tasweeq 30%, PropertyHub 20%); cost to sales by channel (brokers 0.8% best; PR, outdoor and influencers in red).

  Say: *"The same charts arrive by email — they're built so Outlook shows them, not as images that get blocked."*
- [ ] Show the **Campaign recommendations — 23 open, 3 urgent** section: what to change, why, and how ("apply in one click on Campaigns", "email drafted for your approval").
- [ ] Scroll to **What the data shows & market initiatives**: first the sources scanned this morning with their counts, then the findings with their cross-source evidence (e.g. the PropertyHub email under the Marina Tower drop), then initiatives of different types, each marked with the finding it answers. They're also on the Initiatives page to shortlist or approve.
- [ ] Press **▶ Play**: a full-screen Kinan-style presentation (about 20 slides, one idea each) with animated charts — rings fill for each project, bars grow, the vendor donut draws itself, each finding gets its own slide with its trend and evidence, each initiative its forecast. The voice-over is ElevenLabs when a key is set (else the browser voice); mute it with **Voice on**.
- [ ] Show the schedule: 07:30 Riyadh, Sunday–Thursday, English and Arabic, internal addresses only.

### 6. Approve the June budget plan (3 min)

- [ ] On **Director**, go to **Budget plan**: total SAR 596K, about **+SAR 0.6M** extra sales, **SAR 62K** held in reserve.
- [ ] Explain the logic: money moves to the vendors that bring the most extra sales per riyal. The exiting vendor (Hajar) is halved, and Tasweeq is cut while it's being tested.
- [ ] Click **Approve plan**. The approval is recorded with your name; nothing is sent to Kinan's sales agent.
- [ ] Scroll to **Data from Kinan's sales agent**: read-only — leads read, matched to a campaign code, last sync. Say: *"The director only takes data from the sales agent; it never sends it anything."*

### 7. Orchestration — running the vendors (5 min)

- [ ] Open **Vendors** (the old Orchestration page; supplier invoices now live here too). Show the four role cards: you, the director, vendors, and Kinan's agent (owns leads and sales).
- [ ] The **vendor list**: 6 current vendors with score, decision, campaigns, spend, cost to sales, invoices outstanding, work in progress and emails. The filters show **Alternatives (5)** (pre-vetted alternative vendors) and **Past (3)** (vendors from the history).
- [ ] **14 waiting for your approval** under the list: 6 June briefs (drafted from the plan you just approved), 7 routine (5 lead-feedback emails and 2 reminders for late items), and 1 non-renewal notice. Click **Show the messages** and open the **PropertyHub KSA** brief: it's in **Arabic**, the vendor's language.
- [ ] Tick **I have read the routine messages**, then click **Approve and send all routine**.
- [ ] Tick **I have read the briefs**, then click **Approve and send all briefs**.
- [ ] Click **Sada Influence** in the vendor list. Show the header (score 41, SAR 232K spend, SAR 54K outstanding) and the decision: a 60-day performance plan.
  - **Overview:** its work orders with the director's checks, and what it owes us. Click **Mark received** on the late item, *Creator content — June batch*. It becomes "Received late".
  - **Campaigns:** its live 2026 campaigns and its past campaigns with their lessons.
  - **Invoices:** its Oracle invoices with payment status and reconciliation checks — approve, dispute or reopen them right here (e.g. Tasweeq Digital: an invoice SAR 107.5K vs 96K delivered, +12%). Below the vendor list, **Supplier invoices (Oracle)** shows every vendor; click a vendor name to jump to its invoices.
  - **Emails:** the correspondence through Outlook: our briefs, feedback and reminders, and the vendor's replies, invoices and reports. Say: *"In the demo, the vendor's replies are simulated; live, they are read from the Outlook mailbox."*
- [ ] Click **← All vendors**. Leave the **Hajar non-renewal notice** unapproved: a contract decision.

### 8. The report shows what changed (2 min)

- [ ] **Reports**, then **Preview today's report** again. In **"Since the last report"** expect:
  - Decisions waiting **9 → 7** (9 because the email you drafted in step 2 joined the list)
  - Late vendor deliverables **2 → 1**
  - Work orders with vendors **0 → 7**
  - Overdue work orders **0 → 1**, in red (Nakhla's press release is still late after a reminder)
- [ ] Click **Download PDF** (or **Download HTML**): the same report the manager gets by email, as an A4 PDF to forward or file. **Download PDF** next to **Run snapshot** also works before any report is open. Press **▶ Play** (or ▶ on any History row) to watch the report as a presentation: one slide per section, chart and idea, with an optional voice-over.

### 8b. Campaigns — every campaign as a dashboard (2 min)

- [ ] **Campaigns**: 53 campaigns (10 live, 43 from 2023–2025), each with its figures; the live ones open on their dashboard (sales and spend by month, funnel, cost to sales vs the channel benchmark).
- [ ] In the assistant: *"Add cost per qualified lead to the campaign dashboards"*, then *"Add a chart of leads by city to each campaign"*, then *"Sort campaigns by cost to sales"*. Each answer shows a card with **Open Campaigns** and **Undo**; reopen Campaigns to see the changes.
- [ ] *"Show 2024 campaigns on the campaigns page"*: the list switches to 2024, each with its lesson. Finish with *"Reset the campaign dashboards"*.

### 8c. Celebrations, live news, settings, dashboards, PowerPoint (4 min)

- [ ] **Initiatives**: the chips include **News** (real news for Jeddah and Riyadh) and **Calendar** (celebrations from the Umm al-Qura calendar). Click **News**, then **Initiatives for this** on *Riyadh Season 2026 opens on 21 October* → a Riyadh investor lounge during Riyadh Season, quoting the news. Scroll to **Celebrations and moments** and do the same on **Ramadan 2027** → a Ramadan payment-plan offer planned for February 2027.
- [ ] Ask the assistant *"What's in the news in Jeddah?"* and *"Upcoming celebrations"*.
- [ ] Click the **gear icon** (top right): every integration with its status and how to connect it.
- [ ] Ask *"Remove the YTD sales from all dashboards"* — the tile disappears from the Director page at once; *"Undo the last dashboard change"* brings it back.
- [ ] **Reports** → open a report → **Download PowerPoint**: the presentation as a .pptx with native charts and speaker notes. The report's **Daily campaign check** section lists every item of the Daily check.

### 9. Meta — which agency runs each campaign (3 min)

- [ ] **Campaigns**, then scroll to **Meta ads — which agency runs each campaign** at the bottom (or click the Meta item in the Director's inbox, which jumps there). Expect: **SAR 576.2K Meta spend, 8 campaigns, 92% attributed to an agency.**
- [ ] Show a clean one, *ASH-SEARCH-26 | Ash Shati…*: high confidence. The evidence is the code in its name, the utm on its ads, and that it was created by Layla Nasser of Tasweeq.
- [ ] Show the **red rows**:
  - *New campaign 14/05*: **Digital Wave Agency isn't one of your vendors** but has access to the ad account (SAR 8K). The agent flags it as urgent.
  - *Marina Tower | Corniche video views*: **conflicting evidence**. It carries Hajar Outdoor's code but was created by Tasweeq (SAR 33.6K). Choose **Hajar Outdoor → Confirm**: attributed rises to **98%**.
  - *Andalus | Retargeting*: no tracking codes, so the agent inferred the code from Tasweeq's other campaign in that account (medium confidence). It also drafts an email asking Tasweeq to add the codes.
- [ ] Ask the assistant *"Which agency runs each Meta campaign?"*

### 10. Who's worth renewing (3 min)

- [ ] **Vendors → Vendor scoring board** (scroll down, or open `/decisions`, which redirects there): six vendors ranked on one fair scale, each with a decision. For example, **Hajar Outdoor: exit** (high confidence) and **Tasweeq Digital: test a replacement**. Show the evidence and "what would change this".
- [ ] **Experiments**: the holdout test shows how much of a vendor's results it really caused.
- [ ] **Vendor scoring board → Replacement trials**: **Wasel Performance won its trial against Tasweeq Digital**. One click promotes it, and it gets budget in the next plan.

### 11. Market initiatives from all your data (4 min)

- [ ] Open **Initiatives**. The top panel, **What the data shows**, starts with the daily scan's sources: **CRM 5,100 leads → 3 · Email 6 → 5 · Invoices & POs 53 → 1 · Social & ad platforms 128 → 1 · Competitors 5 → 3 · Market 5 → 3 · Calendar 8 → 3**. Click a source chip to filter.
- [ ] Point at the cross-links: under **Marina Tower: new leads down 39% in the last 3 weeks** sits PropertyHub's email "featured slot ended 10 May"; under **Andalus Quarter: new leads falling for 12 weeks (−41%)** sit Sada's restart proposal, the **SAR 92K unused on the paused creator PO**, Lumen's ad push, the ad fatigue and the softening Jeddah South market. Say: *"Every source is scanned every morning before the report — the CRM, the inbox, Oracle, the ad platforms, competitors' ads, the market and the calendar."*
- [ ] Click **Generate initiatives** with the brief empty. The director picks the project furthest behind target: **Andalus Quarter · September 2026 · After summer · Close sales · SAR 150K**.
- [ ] Four initiatives of different types, each with a channel mix, vendors, forecast and guardrails:
  1. **Refill the top of the funnel** (campaign) — *answers* "new leads falling for 12 weeks", and quotes the evidence: Sada's proposal, the SAR 92K on its PO, the ad fatigue. Digital is capped at 20% because it costs 6% of sales for Andalus today (benchmark 1.9%).
  2. **Closing offer to turn interest into contracts** (offer) — *answers* "contracts down".
  3. **Creative refresh for the off-plan funnel** (content) — *answers* "click-through rate down 28% (Meta, Snap)".
  4. **Broker & site-visit sprint** (broker programme).
- [ ] In the panel, click **Initiatives for this** next to: the Marina Tower drop (→ **Recover the property portals lead flow**), Mirsa's yield promise (→ **Investor proof against Mirsa Developments' yield promise**), and the Cityscape email (→ **Cityscape stand, show-unit VR and booked meetings**).
- [ ] Say: *"The forecasts come from your 2023–2025 history, adjusted for this project and the season. They are not invented by the AI."* Open **Guardrails, measurement, evidence and risks** on one idea.
- [ ] Change the brief to **Marina Tower, February 2027 (Ramadan), 300** and generate. The payment-plan offer leads (Ramadan 2025 lesson), at about 1.4% cost to sales.
- [ ] Click **Shortlist** on one idea, then **Approve & draft vendor brief** on another. The brief opens in the assistant as a draft to the lead vendor, in the vendor's language. Don't send it.
- [ ] Say: *"With AI keys, two different models propose ideas (Gemini and OpenAI by default) and Claude ranks them against your data. In the Claude app edition, Claude does both through your own account."*
- [ ] If asked about the AI set-up: Claude, OpenAI and Gemini are all built in. Each kind of work goes to the one best suited to it (data questions, analysis and Arabic email wording to Claude; ideas to Gemini plus a second model; bulk work to Gemini Flash), and the next one answers if one fails. This runs in the background; there is no screen for it.

### 12. Ask the assistant (3 min)

- [ ] Use 4–5 questions from section D, for example *"What changed since yesterday?"*, *"How did Ramadan campaigns perform?"*, *"Compare 2024 and 2025"*, *"How much did we spend in March by project?"* and *"Should we renew Hajar Outdoor?"*
- [ ] Say: *"With a Claude, OpenAI or Gemini key (or in the Claude app edition) it answers anything from this data, in its own words, and shows which model answered."*
- [ ] *"Generate a pie chart with revenue generated by vendor"*. A pie appears: Mubasher 51.2M (38%), Tasweeq 39.9M (30%), PropertyHub 27.2M (20%) of SAR 134M in 2026. Click **Donut** or **Bars** to switch the type, then **Download PNG**. Then try *"Line chart of monthly spend for Marina Tower"* or *"Bar chart of cost to sales by channel in 2025"* (events 1% best, PR 9.4% worst). Say: *"Every number is computed from the data — the AI chooses the chart, it never types the figures."*
- [ ] In the Claude app edition (or with an AI key), ask for something open-ended. Examples:
  - *"Spend by year split by channel as a stacked chart"*: 2025 was the biggest year (SAR 6.2M), driven by brokers.
  - *"CRM-verified vs vendor-reported sales per vendor"*: Tasweeq reports 47.9M against 39.9M in the CRM.
  - *"Spend vs sales per vendor as a scatter"*.
  - *"Price per sqm by district, indexed"*: Jeddah South is the only district below 100.

  More that the data now supports, in the Claude app edition:
  - *"Buyer types by year as a 100% stacked chart"*: investors' share rises from 2023 to 2025.
  - *"Ramadan cost to sales by year, including 2026"*.
  - *"What we paid each vendor per year"*.
  - *"Sales target vs actual by month"*.
  - *"On-time deliverables by vendor"*.
  - *"Meta spend by agency"*, and *"a graph of Meta ads revenue over the last six months"* (SAR 2.6M in January → ~4M a month from March).
  - *"Price per sqm by district since 2023"*.
  - *"2023–2025 sales by vendor, including past vendors"*.

  On **Vendors**, open a past vendor (e.g. Najm Media), then **Invoices**: its 2023–2025 invoice archive (18 invoices, SAR 1,295K, all paid).

  Hover a bar or line, press **Table**, then **CSV**. Say: *"Any chart the data can support, from one sentence, and the same through the API for Kinan's systems."*
- [ ] *"Draft an email to Tasweeq Digital"*, then pick an item: the draft appears for approval. Don't send it; show the approval controls instead.

### 12b. Ask about buyers, ads and the market (optional, 3 min)

- [ ] *"Investors or end users — who converts better?"* Investors qualify best (about 27%), first-time buyers worst (about 16%).
- [ ] *"Why do we lose leads?"* The top reason is "Not a buyer" (26%), then "No response" (16%), which is Kinan's follow-up.
- [ ] *"Which creatives work best?"* Show-unit tours, location search and payment-plan ads cost the least per qualified lead; lifestyle stories are cheap per lead but only 11% qualify, and two are fatigued.
- [ ] *"How is the property market in Jeddah?"* Jeddah South is the only district with falling prices and sales (–1% and –4.8% a year) and 61% off-plan supply. This is part of why Andalus is behind target.
- [ ] *"Who competes with Marina Tower?"* Mirsa Towers offers a guaranteed 6% rental yield, and its Meta ads went from 0 to 15–16 a month since February.
- [ ] Say: *"Lead profiles, creatives, market and competitor figures are sample data in the shape the real sources (Yardi, the ad platforms, REGA, the Meta Ad Library) will provide."*

### 13. Arabic (2 min)

- [ ] Click **العربية**: the whole app flips right-to-left.
- [ ] Ask *"ما موجز اليوم؟"*, *"ما الجديد منذ الأمس؟"* or *"كيف كان أداء حملات رمضان؟"*
- [ ] Open **Daily check** in Arabic.
- [ ] **Reports** in Arabic, then **View** the Arabic report.

### 14. Close (2 min)

- [ ] Walk through the integration status table (section F) and the questions for Kinan (section G).

## D. Question bank (all tested; `npm run chat:eval` checks 145 questions and 148 off-script phrasings)

**English**
- What's today's brief?
- Generate a pie chart with revenue generated by vendor
- Line chart of monthly spend for Marina Tower
- Bar chart of cost to sales by channel in 2025
- What needs my approval?
- What should I change in the campaigns?
- What do vendors owe us?
- What's the budget plan for June?
- When is my daily report?
- Which vendor converts best?
- Should we renew Hajar Outdoor?
- What vendor do you suggest to terminate and why? (Hajar Outdoor: exit at contract end, with the evidence; Tasweeq Digital next)
- أي مورد تقترح إنهاء عقده ولماذا؟
- Do vendor numbers match the CRM?
- Any invoice problems?
- Which contracts are ending?
- What data do we read from Kinan's sales agent?
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
- Why did Marina Tower leads drop? (the finding plus the PropertyHub email that explains it)
- What does the data show today?
- Give me campaign ideas for Marina Tower in Ramadan with SAR 300K
- Brainstorm a new campaign for Andalus
- Plan a campaign for the Cityscape season
- Which cities do our leads come from?
- Investors or end users — who converts better?
- Why do we lose leads?
- Which creatives work best? / Arabic or English ads?
- How is the property market in Jeddah?
- What are competitors doing? / Who competes with Marina Tower?
- When is Ramadan next year?
- How did Palm Villas campaigns perform? / Compare 2023 and 2025

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
- اقترح حملة جديدة للأندلس في نوفمبر
- أفكار لحملة رمضان لبرج المارينا
- لماذا نخسر العملاء؟
- أي الإعلانات الأفضل؟
- كيف السوق العقاري في جدة؟
- ماذا يفعل المنافسون؟

## E. Pitfalls and recovery

- **Reloading the demo file resets everything.** Don't reload mid-demo unless you want to start over. To reset the live app: stop it (Ctrl+C) and run `npm run demo:live`.
- **Off-script questions in the demo file** may get the general help answer (built-in answers, no AI). Say: *"With Claude, OpenAI or Gemini connected it answers anything from this data"*, or switch to the Claude app edition, where Claude answers.
- **If an answer misses:** press **Not what I asked** under it. The assistant offers the closest questions it can answer and logs the miss on Reports → *Questions the assistant missed*. Say: *"Nobody can predict every question, so it never bluffs: it offers the nearest answers, and every miss becomes a test case."*
- **Claude app edition slow or not answering?** An answer that looks up data takes about 30–90 seconds. If the viewer declined Claude, or Claude is unavailable, it answers with the built-in rules; reload the page to be asked again.
- **Approving an idea adds an email draft**, so the "Decisions waiting" count in the report goes up by one. Do the ideation step after step 8, as written.
- **The CRM-feed alert is expected:** the sample CRM data ends on 30 May, and the clock is 8 June.
- **Buttons greyed out?** Your name isn't in "Approving as", or the "I have read" box isn't ticked.
- **Report dated today, figures from 8 June:** expected (sample data).
- **No email is sent anywhere**, and the screens say "simulated".

## F. Integration status (for the close)

| Component | Status | Needed from the client |
|---|---|---|
| Yardi | Not built yet | Yardi interface licence, credentials, field mapping |
| Outlook (send, and read vendor correspondence) | Built; not yet tested on their tenant | Entra app registration with Mail.Send and Mail.Read on the marketing mailbox |
| Oracle Fusion | Built (read-only); not yet tested on their instance | Oracle user and URL |
| Meta ads | Built; simulated in the demo; live mode not yet run on a real account | System-user token (`ads_read`, `business_management`), ad account IDs |
| Scheduler for daily reports | Built | A scheduler calling the endpoint every 15 minutes |
| AI: Claude, OpenAI and Gemini, with task routing | Built, with failover; tested against mock servers (Claude app edition uses your Claude account) | Any of an Anthropic, OpenAI or Gemini API key |

## G. Questions to ask (to move to a pilot)

1. Which Yardi product and version does Kinan run, and which interface or export can we read from?
2. Where is the campaign code captured on a lead in Yardi?
3. Can the CRM export run daily before the 07:30 report, and who at Kinan owns it?
5. What are the real monthly sales targets per project?
6. The vendor list, contracts (end dates, notice periods) and account-manager emails.
7. Oracle supplier numbers per vendor; access to Oracle Fusion.
8. Report recipients and the time they want the daily report.
9. Meta: which ad accounts exist, which Business Manager owns each, and which agencies have partner access. Will agencies adopt the naming and `utm_campaign` convention?
