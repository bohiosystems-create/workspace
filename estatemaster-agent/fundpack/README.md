# Saudi + UAE Real Estate Fund Knowledge Pack (AR / EN)

This pack is the knowledge layer for an agent that reads a Saudi real estate fund agreement (CMA Terms and
Conditions, LPA or offering memorandum), in Arabic or English, and produces validated inputs for a financial
modelling engine. It does not do the financial modelling itself.

## Regimes covered

| `fund.jurisdiction` | Regulator | Depth |
|---|---|---|
| `KSA_CMA` | Saudi Capital Market Authority | Rules read from the CMA regulation text (public funds and REITs). |
| `UAE_ONSHORE` | UAE Capital Market Authority (formerly SCA, renamed 1 Jan 2026) | Law-firm summaries only; the regime is in transition. |
| `DIFC` | DFSA | Law-firm summaries only. |
| `ADGM` | FSRA | Law-firm summaries only. |

**The two CMAs are different regulators.** Arabic: Saudi هيئة السوق المالية, UAE هيئة سوق المال. `detect_jurisdiction`
will not decide on a bare "CMA".

## What's inside

| Path | What it is |
|---|---|
| `data/terms.yaml` | **126 bilingual terms (926 AR/EN labels and synonyms)**: parties, fund structure, governance, capital, units, valuation, fees and fee bases, frequencies, financing, Islamic finance, real estate, tax, regulators. Each term has a canonical id, AR/EN definition, target schema field and verification level. |
| `data/calendar.yaml` | **Arabic calendar dataset**: 12 Hijri months (92 spellings in AR and EN), Gregorian months in Gulf and Levantine Arabic, weekdays and the Saudi weekend, era markers (هـ / م / AH / G), "الموافق" equivalence words, period words (سنة هجرية, يوم عمل …), and modelling conventions (Hijri year length, zakat year, CMA working-day definition, holidays). |
| `data/ummalqura_months.csv` | **Official Umm al-Qura calendar table**: 1,740 months, 1356–1500 AH (1937–2077), generated from ICU's `islamic-umalqura` calendar (`tools/build_ummalqura.js`). Gives exact day-level conversion with no external dependency. |
| `data/cma_rules.yaml` | 23 CMA limits (borrowing, REIT 90% distribution, 75%/25% allocation, valuation, board, offering, liquidation …), 7 model rules the engine must apply, and dated tax defaults (RETT, VAT, zakat, white land fee). Each has AR + EN text and an article citation. |
| `data/tc_sections.yaml` | The 34 sections of CMA Annex 1 in order, plus REIT (Annex 2) and private-fund extras, with AR/EN headings and the schema fields each one feeds. Used for locating sections and checking completeness. |
| `data/uae_rules.yaml` | **UAE pack**: 21 limits across onshore, DIFC and ADGM (distribution 80%, onshore borrowing 50%, REIT/QIF tax-exemption tests from Cabinet Decision 34/2025 and more), 6 model rules (9% corporate tax, investor-level 80% inclusion, free-zone SPV trap, weekend/dates), dated tax and Dubai fee defaults, and registration conventions. Every rule has a `confidence` of `primary`, `secondary` or `low`. |
| `data/terms_uae.yaml` | 54 UAE terms in AR/EN: regulators (DFSA, FSRA, DLD, RERA, ADREC, FTA, DFM, ADX), structures (Exempt Fund, QIF, investment trust), real-estate terms (escrow, off-plan, Oqood, Ejari, service charge, freehold/leasehold), UAE tax terms. Loaded together with `terms.yaml`; `jurisdiction` filter hides terms from the other country. |
| `data/uae_sections.yaml` | 20-section locating checklist for UAE offering documents (no mandated order exists, all market usage). |
| `data/jurisdictions.yaml` + `bohio_fundpack/jurisdiction.py` | Regime detection with evidence and a "bare CMA is ambiguous" guard. |
| `examples/sample_uae_extraction_FICTIONAL.json` | Made-up DIFC REIT with planted problems: 70% payout, open-ended, AED 80m property and a 62% holder against the tax-exemption tests, a fee with no frequency, missing term and fiscal year end. |
| `schema/fund_extraction.schema.json` | Output contract: language-neutral values, plus verbatim evidence in the source language with a translation, plus status (`extracted / derived / defaulted / missing / conflict`). |
| `skill/SKILL.md` | Agent instructions: bilingual rules, step-by-step workflow, and things never to do. |
| `bohio_fundpack/` | Python library + MCP server (16 tools, adds `detect_jurisdiction` and `tax_defaults`): term lookup, number/percent/duration parsing (Arabic-Indic digits, "%2", مليون), Hijri/Gregorian date parsing and conversion, PDF Arabic text-quality check, validator. |
| `engine_map.yaml` | Map from schema fields to your engine's input names. **You fill this in.** |
| `examples/sample_extraction_FICTIONAL.json` | A fully worked extraction of a made-up REIT, with planted problems that the validator catches. |
| `tests/` | 53 tests (21 for the UAE pack), including official date anchors and a day-by-day calendar round-trip from 2000 to 2060. |

## Quick start

```bash
pip install pyyaml jsonschema mcp
python -m unittest discover -s tests
python -m bohio_fundpack validate examples/sample_extraction_FICTIONAL.json ar
python -m bohio_fundpack dates "صدر بتاريخ 1446/11/23هـ الموافق 2025/05/21م"
python -m bohio_fundpack term "أتعاب الأداء"
python -m bohio_fundpack glossary both UAE_ONSHORE > glossary.txt   # compact glossary for a system prompt
python -m bohio_fundpack jurisdiction "regulated by the DFSA in the DIFC"
python -m bohio_fundpack validate examples/sample_uae_extraction_FICTIONAL.json en
```

### Wiring into the agent

Register the MCP server (Claude Agent SDK / Claude Code `mcpServers` config):

```json
{ "saudi_fund_pack": { "command": "python", "args": ["-m", "bohio_fundpack", "serve"],
                       "cwd": "/path/to/saudi-re-fund-pack" } }
```

Then load `skill/SKILL.md` as the agent's skill. The agent's loop is: check text quality → identify fund
kind → `section_checklist` → extract with `find_terms` / `parse_*` / `parse_dates` → `validate_extraction`
→ hand the JSON and `model_rules` to your engine via `engine_map.yaml`.

## Bilingual design

- The agent quotes the document in its own language, and puts the translation alongside the quote.
- Values are language-neutral: numbers, ISO dates plus the Hijri date, and canonical enum ids.
- Names are stored as `{ar, en}`.
- Every validator finding and open question carries both `en` and `ar` text, so the UI just picks one.
- `format_date()` renders "23 ذو القعدة 1446هـ الموافق 21 مايو 2025م" or "23 Dhu al-Qi'dah 1446 AH / 21 May 2025".
- Matching folds hamza, alef, taa marbuta, diacritics, tatweel and Arabic-Indic digits, so spelling
  variants in real documents still resolve.

## What to know before relying on it

1. **Verification levels.**
   - 39 terms take their definition wording from the CMA Glossary (2025), and 42 terms come from the REIF
     Regulations.
   - 45 are `market_usage`: common Saudi phrasing for things the CMA doesn't define, such as hurdle,
     catch-up, acquisition fee and Murabaha. Have a Saudi fund lawyer or analyst review these before they
     appear to clients as official wording.
2. **Arabic section headings** in `tc_sections.yaml` are common market phrasing. I couldn't read the
   Arabic text of Annex 1 directly, because the PDF text layer was scrambled. Confirm them against a few
   real T&Cs and add any variants you find.
3. **Private funds.** The CMA limits encoded here are for public real estate funds and REITs. Private
   real estate funds (Investment Funds Regulations Part 5) get completeness and date checks only.
   Encoding the IFR private-fund rules would be the next step.
4. **Tax defaults are dated (as of 23 Oct 2026)** and are not advice. RETT exemptions, zakat treatment
   of the fund, and the non-Saudi fee need confirming per deal.
5. **Calendar range** is 1356–1500 AH. Eid holidays depend on moon sighting and can differ from the
   table by a day; use Saudi Exchange or CMA announcements for exact closures.
6. **Arabic PDFs.** Many Saudi PDFs extract with scrambled ligatures ("يف" for "في"). Run
   `check_text_quality` first, and read degraded pages from images.

## UAE pack: what to know before relying on it

1. **Weaker evidence than the Saudi side.** The Saudi limits were checked against the CMA's regulation text. The UAE
   limits come from law-firm and regulator-news summaries (Al Tamimi, Kayrouz, BSA, Simmons & Simmons) because the
   rule texts were not read. Treat a UAE finding as "check this against the current rule", especially `low`.
2. **The onshore regime moved.** The SCA became the CMA on 1 Jan 2026 (Federal Law 32/2025), and Federal Law 33/2025
   replaces the old regime. The last onshore real estate fund rules summarised here are SCA Administrative Decision
   6/R.T of 2019. Implementing regulations were reportedly not issued yet, with a transition to 1 Jan 2027.
3. **Conflicting or thin items I flagged `low`:** ADGM REIT borrowing 70% of NAV (one 2023 source), DIFC public
   property fund borrowing 50% of gross assets (one source), 36-month listing deadline, onshore usufruct 25%, and the
   Arabic-documents requirement. Onshore valuation frequency and number of valuers were not stated in any source
   and are not encoded.
4. **Not verified at all:** Abu Dhabi 2% registration fee, Dubai 5% escrow retention, and VAT treatment of leases and
   fund fees. They are in `tax_defaults` marked `low` or described as unverified.
5. **UAE Arabic terms are all `market_usage`**, except the CMA's own Arabic name (from the u.ae government portal).
   Have a UAE fund lawyer review before they appear to clients as official wording.
6. **Dubai fees** come from a property-portal blog (updated 3 Jul 2026), not from the DLD. Confirm with the DLD.
7. **Not covered:** DIFC/ADGM prospectus content rules, Sharia fund rules, VARA/tokenised property, off-plan developer
   regulations beyond the escrow law, and Ras Al Khaimah, Sharjah or other emirate registration fees.

## Extending

- **New synonyms:** add them to `ar_syn` / `en_syn` in `terms.yaml`. Every fund you process will surface
  new phrasings, and this list becomes your proprietary asset.
- **New CMA rule:** add an entry to `checks` in `cma_rules.yaml` with `field`, `op`, `limit`,
  `applies_to` and a citation.
- **After a regulation amendment:** update `regulation_version` and re-run the tests.
- **Rebuilding the calendar table:** `node tools/build_ummalqura.js > data/ummalqura_months.csv`.

## Sources

- CMA Real Estate Investment Funds Regulations, as amended by Board resolution 1-54-2025 (21/05/2025), English translation and Annexes 1–2
- CMA Glossary of Defined Terms Used in the Regulations and Rules of the CMA (Arabic, 2025)
- Umm al-Qura calendar via ICU 77 (`islamic-umalqura`), checked against CMA resolution dates and the Umm al-Qura gazette
- UAE: Al Tamimi (SCA Administrative Decision 6/R.T of 2019; property funds 2020; capital markets overhaul 2026), Kayrouz & Associates (fund structuring, Mar 2026), BSA (ADGM real estate funds, Jun 2023), Simmons & Simmons (Cabinet Decision 34 of 2025), Property Finder (DLD fees, Jul 2026), u.ae (CMA Arabic name)
- RETT Law and Implementing Regulations (effective 10 Apr 2025); White Land and Vacant Property Fees Law (amended 2025)
