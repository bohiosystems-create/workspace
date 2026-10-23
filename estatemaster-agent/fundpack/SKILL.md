---
name: gulf-re-fund-extraction
description: Read a Saudi or UAE (onshore, DIFC, ADGM) real estate fund document in Arabic, English or bilingual, extract every model input with clause-level evidence, check it against the right regulator's limits, and hand a validated JSON to the financial modelling engine. Use for any REIF, REIT, property fund, private real estate fund, LPA, T&C, prospectus or offering memorandum.
---

# Saudi and UAE real estate fund extraction

You turn a fund document into `schema/fund_extraction.schema.json`. The modelling engine does the maths, so
never compute model outputs yourself. Your job is to get the inputs right, prove where each one came from,
and say clearly what is missing.

The tools come from the `saudi_fund_pack` MCP server (`python -m bohio_fundpack serve`). Reference data is
in `data/`: `terms.yaml` and `terms_uae.yaml`, `calendar.yaml`, `tc_sections.yaml` and `uae_sections.yaml`,
`cma_rules.yaml` (Saudi) and `uae_rules.yaml` (UAE), and `jurisdictions.yaml`.

## Step 0: which regime? (do this before anything else)

Call `detect_jurisdiction` on the cover page and set `fund.jurisdiction` to `KSA_CMA`, `UAE_ONSHORE`, `DIFC` or
`ADGM`. The limits, fund kinds, tax logic and calendar differ completely by regime.

- **"CMA" is ambiguous.** The Saudi Capital Market Authority and the UAE Capital Market Authority (the former
  SCA, renamed on 1 Jan 2026) share the acronym. Arabic differs by one word: Saudi هيئة السوق المالية, UAE هيئة سوق المال.
  If `detect_jurisdiction` returns low confidence, read the cover page or ask. Do not guess.
- Saudi kinds: `public_reif`, `reit_main`, `reit_parallel`, `private_re_fund`. UAE kinds: `reit_public`,
  `reit_private`, `property_fund_public`, `property_fund_exempt`, `property_fund_qif`, `property_fund_private`.
- **UAE documents** are mostly Gregorian-dated (no Hijri logic unless the text uses it), in AED or USD, with a
  Saturday-Sunday weekend. DIFC and ADGM documents are English; onshore documents should also exist in Arabic.
  UAE sections have no single mandated order, so call `section_checklist(kind, jurisdiction)` and search by meaning.
- **UAE tax is a model input, not a footnote.** Capture `fund.reit_tax_exempt`, `investors.count`,
  `investors.max_single_holder_pct`, `assets.immovable_property_value_aed` and `taxes.corporate_tax`. The REIT and
  QIF exemptions depend on them. Call `tax_defaults(jurisdiction)` and `model_rules(lang, jurisdiction)`.
- **Borrowing basis matters.** Record `financing.borrowing_basis` (gross assets vs NAV). A 70% cap on NAV is not a
  70% cap on gross assets.
- **UAE rules carry a `confidence` flag.** They came from law-firm summaries, not the rule text. Report a
  `low` or `secondary` finding as "check against the current rule", never as a confirmed breach.

## Language rules (the app must work equally in Arabic and English)

- Extract from the document in its own language. Every `sources[].quote` is verbatim in the original language,
  and `quote_translation` holds the other language.
- Values are language-neutral: numbers as numbers, dates as ISO plus Hijri, enums as canonical ids. Names of
  funds, parties, assets and cities go in `{ar, en}`. Fill both; if the document gives only one language,
  translate the other and set `note: "translated"`.
- Saudi T&Cs are prepared in Arabic, and Arabic normally prevails. If a bilingual document disagrees with
  itself, set `status: conflict`, quote both versions, and record `prevailing_language`.
- Write user-facing messages (open questions, summaries) in the user's UI language. `open_questions` always
  carries both `question_en` and `question_ar`.
- Never translate a defined term freely. Resolve it with `lookup_term` or `find_terms`, and use the canonical
  `id` and the official labels from `terms.yaml`.

## Workflow

1. **Check the text layer.** Run `check_text_quality` on a sample of each Arabic page. If the verdict is
   `degraded` (letters scrambled by PDF ligature breakage, e.g. "يف" for "في", "جملس" for "مجلس"), read those
   pages from page images instead, then set `document.extraction_quality` accordingly. Never read numbers
   from a degraded page.
2. **Identify the fund kind.** Look at the cover page, then set `fund.kind` (`public_reif`, `reit_main`,
   `reit_parallel`, `private_re_fund`) and `fund.structure`. This decides which rules apply.
3. **Map the sections.** Call `section_checklist(fund_kind)` and locate each section by its Arabic or English
   heading. Public funds follow CMA Annex 1 order. Private-fund documents do not, so search by meaning.
4. **Extract, section by section, starting with `model_critical: true` sections.** For every value:
   - Run numbers through `parse_amount`, `parse_percent` and `parse_duration`. Watch for "%2" written
     right-to-left, Arabic-Indic digits (٢٫٥), and scale words (مليون, مليار).
   - Run dates through `parse_dates`. Saudi documents write "1446/11/23هـ الموافق 2025/05/21م". Keep both
     calendars. If the pair disagrees with Umm al-Qura, keep the document's text, record the difference in
     `note`, and the validator will flag it. Do not "fix" the document silently.
   - Status: `extracted` means stated in the document. `derived` means calculated from stated values (say how
     in `note`). `defaulted` means a regulatory or default value (say which). `missing` means not stated.
     `conflict` means the document says different things.
   - Confidence: below 0.7 whenever wording is ambiguous.
5. **Fees.** Build one `fees[]` item per fee in the fee table and in the body text. Map the type with
   `find_terms(text, ["fees","fee_basis","frequency"])`. For each fee, capture the rate or amount, basis
   (`total_assets`, `nav`, `rent_collected`, `purchase_price` ...), frequency, accrual, payer, VAT treatment
   (fees are usually quoted ex-VAT at 15%), caps and waivers. Cross-check the fee table against the narrative;
   any difference is a `conflict`.
6. **Performance fee and waterfall.** Capture the hurdle (rate and type), catch-up, split, tiers, crystallisation
   and clawback. Saudi T&Cs often describe these in prose (أتعاب الأداء, العائد المستهدف). Use the tiers array
   rather than prose.
7. **Hijri-denominated periods.** If a term, lease or escalation is in Hijri years (سنة هجرية), set
   `term_calendar` or `rent_year_basis` to `hijri`. The engine must then step in 354/355-day years, so use
   `add_hijri_period` to compute end dates. If the document says only "سنة" or "year", do not assume Hijri;
   record it as stated.
8. **Validate.** Call `validate_extraction`. For every error or warning: re-check the source first. If the
   document really breaches a CMA limit, keep the value; that is a finding for the user, not an extraction
   error. Add an `open_questions` item for every `missing_critical` item and every conflict.
9. **Hand off.** Return the JSON, the validation report, and a short summary in the user's language: fund,
   key economics, blocking questions. Apply `model_rules` (e.g. management fee stops at liquidation) by
   passing them to the engine, not by changing extracted values.

## Never

- Invent a number, date or party. Missing is a valid answer.
- Fill a value from the regulations or from market norms as if the document said it. Use
  `status: defaulted` and name the rule.
- Treat `market_usage` Arabic terms in `terms.yaml` as official definitions in output to users. Only
  `cma_glossary` and `cma_reif` entries are regulator wording.
- Apply public-fund CMA limits to a private fund as errors. The validator reports them as info only.
- Apply Saudi logic to a UAE fund (Hijri year, Friday-Saturday weekend, RETT, zakat, 15% VAT, SAR) or the reverse.
- Switch corporate tax off for a UAE fund because it says "exempt". Capture the claim and its conditions, and let
  the validator test them.

## Gregorian/Hijri display

When showing a date to a user, use `format_date(gregorian, lang, "dual")`: Arabic gives
"23 ذو القعدة 1446هـ الموافق 21 مايو 2025م", English gives "23 Dhu al-Qi'dah 1446 AH / 21 May 2025".
