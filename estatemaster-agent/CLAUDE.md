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
- The analyst toolkit (hold vs sell, return bridge, line over time and covenants, timing shifts, two-way grids, optimisation, Monte Carlo, mezzanine / refinance / waterfall / zakat overlays, trace, currency, new lines, fund roll-up) runs on the workbook itself: every figure is an exact recalculation. A result the model cannot give is said so (a year past its last period, an IRR its own IFERROR turns into 0, a currency conversion that moves the returns), never shown as a number. Amounts keep the model's unit (a sheet in SAR '000 holds thousands).
- Show every cell changed (sheet!cell, old → new) and every output moved, and offer the workbook back as an .xlsx with the change applied.
- Two models audit the recalculation after the answer. Their disagreement is shown, not hidden.
- Never assume. If the workbook does not say, ask the user in the chat.

## 3. Working rules

- EstateMaster is the trusted layer.
- Test fixtures are synthetic. Never commit client workbooks.
- Before a push run `bash tests/run.sh quick` on its own (no other suite against the same port), and deploy only after GitHub CI is green on that commit.
