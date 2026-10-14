# Draft reply to Elliott (Altus Group)

Subject: RE: EstateMaster integration options — KINAN target architecture

Hi Elliott,

Thank you, that is helpful. The target architecture is an AI agent that sits beside EstateMaster for KINAN's
development models. EstateMaster stays the calculator and the source of every figure; the agent reads from it,
checks assumptions against market data and emails, proposes changes that people approve, and reports. Nothing
changes in EstateMaster without a person's approval.

Information exchanged, per project (feasibility model):
1. Read, daily and on demand: every input (the assumption register), the outputs (equity and project IRR,
   development margin, net profit, total cost, revenue, peak debt, equity multiple), the stored options/stages,
   and the sensitivity tables.
2. Write, only after approval: a small set of input values (for example a sale price, a construction rate,
   a delay), then a recalculation and a read of the new outputs.

Three questions:
- SQL Server: does the publish include inputs, outputs, stored options/stages and sensitivity tables for each
  project, and can it be refreshed on a schedule without opening the model?
- Is there any unattended way to recalculate a model and export or publish the results (command line, COM,
  scheduler), or does that require a bespoke integration from your team?
- Licensing: is unattended or server-side use of EstateMaster covered, and on what terms?

For context: today we use the Office Links Excel export (and, for write-back, a control workbook through
Links to Excel Files) with an analyst in the loop. The SQL Server publish would replace the export for reading;
the bespoke integration would cover the write and recalculate step.

Happy to walk your consulting team through it on a call.

Kind regards,
Matteo
