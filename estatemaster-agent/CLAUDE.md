# KINAN EstateMaster agent: standing rules

These rules hold for every change to this app. They come from the product owner and are not optional.

## 1. AI is always primary

- The AI reads the user's words and names the model cells. Rule-based parsing (`xcParse`, `xcFindLabel`, the router regexes) is the fallback for when no AI is connected or the AI cannot read the sentence.
- When the AI names a typed input cell for every change, its reading is used. A different rule-based reading is noted in the steps, never put to the user as a question.
- Rules may overrule the AI only on certain facts, never on judgement:
  - the cell is not a typed input (a formula, an output, a missing cell);
  - the value is impossible (a percentage over 100, a negative amount, a level 1000× off the current value);
  - the sentence states a direction ("drops", "+10%") and the AI moves the same line the other way;
  - the case/scenario cell the AI names is not the one the model runs on (`xcScenarioLive` picks the live one).
- Do not fix a misreading by adding another phrase rule when the AI path can carry it. Improve the AI prompt (`XC_READ_SYS`), the context it is given, or a certain check instead. New rules must be the no-AI fallback.
- Every new tool or resolver that has to pick a line of a model (goal seek, sensitivity, feasibility drivers, reports) takes the AI's cell first and validates it with the same checks.

## 2. Financial modelling works like Claude for Excel

- Read the actual workbook: inputs, formulas, outputs, labels, units and formats.
- Change only typed input cells. Recalculate the whole workbook exactly with the formula engine (HyperFormula worker). Never estimate a figure on an uploaded model: it is exact, or it is reported as "not computed" with the reason.
- Show every cell changed (sheet!cell, old → new) and every output moved, and offer the workbook back as an .xlsx with the change applied.
- Two models audit the recalculation after the answer. Their disagreement is shown, not hidden.
- Never assume. If the workbook does not say, ask the user in the chat.

## 3. Working rules

- EstateMaster is the trusted layer.
- Test fixtures are synthetic. Never commit client workbooks.
- Before a push run `bash tests/run.sh quick` on its own (no other suite against the same port), and deploy only after GitHub CI is green on that commit.
