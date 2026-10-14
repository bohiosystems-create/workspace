# WhatsApp test script — Kinan Heights

Send these from a phone that is on the allowed list (SETUP.md §6). Each line is one message; the expected behaviour is in brackets. Use the documents in this folder as attachments where a file is named.

## Start
1. `hi` → the project list; reply `1` or `Kinan Heights`.
2. `what's late on the critical path?` → Tower A frame, Hotel Block C, with the activities named.

## Progress updates (text)
3. `Tower A L14 slab at 95%, pour tonight` → TA-STR-L14 moves to 95 %, confirmation with the activity id.
4. `mark TA-STR-L14 as completed` → the activity closes on today's date; L15 columns are next.
5. `hotel block C level 4 transfer beams done` → the agent finds HC-STR-L4, asks to confirm if several activities match.
6. `Tower B zone 8 facade pending, embeds not fixed` → TB-FAC-Z8 stays not started, note recorded with the reason.

## Voice notes (say these; they are transcribed by ElevenLabs)
7. "Atrium roof steel is at ninety percent, the last two trusses go up tomorrow." → PD-ATR-STL updated to 90 %.
8. In Arabic: "بلاطة الدور الرابع عشر في البرج أ اكتملت اليوم" → TA-STR-L14 completed.

## Photos (evidence)
9. A photo of a slab with the caption `Tower A L14 PT tendons placed, ready for ITR` → filed as evidence on TA-STR-L14, the AI reading names the stage and any safety issues.
10. A photo with no caption → the agent describes it and suggests the activity; reply `yes` to file it, or `log safety` if it shows a hazard.

## Documents
11. Send `KH-RFI-0163 ...md` as a file with the caption `file under Tower A L14` → stored in Documents, summarised, pinned to Tower A L14.
12. `what does RFI-0163 say about the tendons?` → T-14/T-15 deviated 150 mm west, 3 × T20 trimmers.

## Questions from the data
13. `which deliveries are delayed this week and what do they block?`
14. `show me the PT layout for tower A level 12` → opens d_seed02.
15. `order 20 tonnes of Ø16 rebar for Tower A L15 by 20 October` → a material request is created against PKG-01.
