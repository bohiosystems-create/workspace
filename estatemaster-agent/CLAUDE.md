# KINAN EstateMaster agent: standing rules

These rules hold for every change to this app. They come from the product owner and are not optional.

## 1. AI is always primary

- The AI reads the user's words and names the model cells. Rule-based parsing (`xcParse`, `xcFindLabel`, the router regexes) is the fallback for when no AI is connected. With an AI connected, the rules only propose a reading for the user to confirm.
- When the AI names a typed input cell for every change, its reading is used. A different rule-based reading is noted in the steps, never put to the user as a question.
- Rules may overrule the AI only on certain facts, never on judgement:
  - the cell is not a typed input (a formula, an output, a missing cell);
  - the value is impossible (a percentage over 100, a negative amount, a level 1000× off the current value);
  - the sentence states a direction ("drops", "+10%") and the AI moves the same line the other way;
  - the case/scenario cell the AI names is not the one the model runs on (`xcScenarioLive` picks the live one).
- Do not fix a misreading by adding another phrase rule when the AI path can carry it. Improve the AI prompt (`XC_READ_SYS`), the context it is given, or a certain check instead. New rules must be the no-AI fallback.
- When the AI's reading fails a certain check, the reason goes back to the AI and it reads again (twice at most); the rules do not take over.
- When no AI answers at all (every model, the retries and a second pass), the rules decide nothing: the AI's saved reading of the same sentence is used, or the rules' reading is put to the user to confirm.
- Every new tool or resolver that has to pick a line of a model (goal seek, sensitivity, feasibility drivers, reports) takes the AI's cell first and validates it with the same checks.

## 2. Financial modelling works like Claude for Excel

- Read the actual workbook: inputs, formulas, outputs, labels, units and formats.
- Change only typed input cells, or the assumption a formula carries: a number written inside a simple formula (Construction Costs =Units*190: the 190) is an input, moved by rewriting that number with the formula kept; a formula line the user names as a lever is moved by a factor on its own formula. Never answer "not computed" while a lever exists. Recalculate the whole workbook exactly with the formula engine (HyperFormula worker). Never estimate a figure on an uploaded model: it is exact, or it is reported as "not computed" with the reason.
- A workbook saved without recalculating (its stored results lag its own typed inputs, proven by a simple formula that gives another result on the file's own inputs) is recalculated on its inputs, and the user is told, with that cell, and asked if the inputs are not the ones meant.
- Extending the cash flow ("by N years") changes the workbook itself, as Excel would: new periods after the last on every timeline sheet, each line's formula carried on, totals, IRR/NPV ranges, names, charts and the input curves read by period stretched to the new end, then an exact recalculation; the extended workbook becomes the project's model (shown on the platform's sheets and downloadable). Numbers typed in the last period, an exit in the last period (or a hold-period input) and an unlabelled period length are asked with clickable answers, never assumed.
- Changes to a model's structure (extending the cash flow, a new line, an added sheet such as a refinance or a mezzanine, a fix to a contract) are Jadwa's only. KINAN relies on EstateMaster: its models change in EstateMaster and are exported again, and KINAN tests them (what-ifs, sensitivities, the analyst toolkit) without rewriting them. Jadwa works fully on the Excel workbook, which it may change. Before a change to a model's structure, the model as it is (workbook and record) is saved in the company database as a write-once version (`/api/store`, kind `version`: nobody replaces or deletes it); if it cannot be saved, the change is not made. What-ifs are not saved there unless the user makes one the model (“Make this the model”).
- The analyst toolkit (hold vs sell, return bridge, line over time and covenants, timing shifts, two-way grids, optimisation, Monte Carlo, mezzanine / refinance / waterfall / zakat overlays, trace, currency, new lines, fund roll-up) runs on the workbook itself: every figure is an exact recalculation. A result the model cannot give is said so (a year past its last period, an IRR its own IFERROR turns into 0, a currency conversion that moves the returns), never shown as a number. Amounts keep the model's unit (a sheet in SAR '000 holds thousands).
- Show every cell changed (sheet!cell, old → new) and every output moved, and offer the workbook back as an .xlsx with the change applied.
- Two models audit the recalculation after the answer. Their disagreement is shown, not hidden.
- One name, one figure: a headline (levered IRR, unlevered IRR, profit on cost) is the scheme's own figure, never a partner's (an LP net IRR, the sponsor's IRR or profit). An answer that gives a headline name another cell's value is flagged under the answer with both cells.
- The model map (on for every upload; Settings → Model map at upload switches it off): the workbook's structure is read once at upload (headline figures with their definitions, units per sheet, scenario switch, timeline, the cash flow behind each IRR, the hold input). The AI's reading is used where its proof on the workbook holds, the rules' otherwise; two proved readings of one figure are a question for the user; every entry is shown on a card and confirmed once; a correction in the chat is proved before it is used. Tools read the map instead of guessing the structure. After every what-if, each IRR is run again on its own proved cash flow and must give the figure the workbook reports; one that does not is flagged in the answer (a change to the hold input, which moves where the line ends, is not re-run).
- Never an estimate in the AI's own words either: an IRR the answer states must be the model's own figure or one the tools computed for that answer; any other is flagged under the answer as not computed.
- A currency conversion cannot move an IRR: lines the AI did not mark as money are added back only when the IRR then ends exactly where it was, and each is named.
- Never assume. If the workbook does not say, ask the user in the chat.
- One shared model record: every workbook made from a model (a contract fix, an extension, a new line or sheet, a what-if made the model, an earlier workbook restored) goes through `newModelVersion` and only through it. It keeps the model as it was (company database), and carries the headline cells, the map (moved by a row insert; read again only when the periods moved), the figures in the model's units, the inputs' roles, the user's verdicts and the regime. A tool never builds a new workbook record by itself.
- Inputs have roles: the AI tags each typed input once at upload (revenue, cost, leverage, rate, yield, timing, count, switch, other), kept in the map so the roles travel with every version. The debug's direction and threshold checks and the plausibility ranges read the role; the label's words are only the fallback when no AI answered.
- What was asked against what was done: a tool that does only part of the request, or something near it, says so with `noteGap` (shown as "Not as asked" under the answer), never a silent default (rounding, a nearest report, a dropped question). Every answer is then checked against the request itself (the AI; certain rules without one).

## 3. Working rules

- EstateMaster is the trusted layer.
- Test fixtures are synthetic. Never commit client workbooks.
- Each model family has a synthetic replica with golden answers from LibreOffice (tests/fixtures/golden/props.json, swept by CI). A correction a user makes to a reading is logged (Settings → Corrections) and becomes a test case.
- Before a push run `bash tests/run.sh core` on its own (no other suite against the same port). CI runs the quick suite on every push and the full suite nightly; deploy only after GitHub CI is green on that commit.
