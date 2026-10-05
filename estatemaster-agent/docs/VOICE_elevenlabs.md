# Narration · ElevenLabs setup and voice choice

## What the app does
- ▶ Play speaks a **script**, not the slide text: a presenter's narration written for the audience (what each figure
  means, transitions, no bullet reading). Claude Fable 5.1 writes it from the deck's figures when an AI key is set;
  otherwise a built-in writer phrases the same figures. Every number spoken is on the slide.
- The script stays hidden; **CC** shows it on request. While a sentence is spoken, the figure it is about glows and the
  rest of the slide steps back. Timing comes from ElevenLabs' character timestamps.
- **🎙 Voice** in the player: pick any voice from your ElevenLabs account (with a sample) and switch the narration to
  **Arabic** (Modern Standard Arabic script, same figures). The choice is kept on that browser.
- The PowerPoint download carries the script in the speaker notes.

## Vercel settings
| Variable | Value |
|---|---|
| `ELEVENLABS_API_KEY` | from elevenlabs.io → Profile → API keys |
| `ELEVENLABS_VOICE_ID` | the default English voice (Voices → the voice → ID). Users can still pick another in the player. |
| `ELEVENLABS_VOICE_ID_AR` | the default Arabic voice (a native Arabic narrator from the Voice Library). Falls back to the English voice if unset. |
| `ELEVENLABS_MODEL` | `eleven_multilingual_v2` (default: consistent, English and Arabic). `eleven_v3` for the most expressive delivery (check it is enabled on your plan). |
| `ELEVENLABS_RIYAL` | how the voice is told to say "riyals". Default `ree-yaals` (stress on the a, as in Saudi usage). Change it here if a voice still says it wrong, e.g. `ree-yahls`; no code change needed. |
| `ELEVENLABS_SETTINGS` | optional JSON, e.g. `{"stability":0.4,"style":0.3}` |

## Why it sounded robotic, and what changed
1. **Voice.** The stock default ("Rachel") is flat for business narration. Pick a narrator voice from the Voice
   Library (elevenlabs.io → Voices → Library; search *narration*, *professional*, *presentation*, filter by language) and
   add it to your voices; it then appears in the player's 🎙 Voice menu. Good starting points in the premade set:
   George, Brian, Daniel (British/American male narration), Charlotte, Lily, Alice (female). For Arabic, filter the
   library by *Arabic* and pick a Gulf or MSA narrator; the multilingual models speak Arabic with any voice, but a
   native Arabic voice sounds right.
2. **Settings.** Stability was 0.5 with little style. The app now sends stability 0.4, similarity 0.8, style 0.3 and
   speaker boost (v3: stability 0.5 "Natural"). Lower stability = more expressive, higher = more monotone.
3. **Text.** It read labels, symbols and bare numbers ("SAR 130M", "22.4%"). The script now says "130 million riyals",
   "22.4 percent", in full sentences with transitions, so the model has prosody to work with.
4. **Continuity.** Each slide is one request; the app passes the previous and next slide's text so the voice does not
   reset its tone between slides.
5. **Model.** `eleven_multilingual_v2` is the safe narrator. Try `eleven_v3` for a more natural read; if it is not on
   your plan the API returns an error and the app falls back to the browser voice, so test on one deck first.

## Checklist to test
1. Set the variables (including `ELEVENLABS_VOICE_ID_AR`), redeploy, open Reports → ▶ Play. The voice button should read "🔊 ElevenLabs".
2. 🎙 Voice → pick a voice, press ▶ on a sample, then Next → the next slide speaks with it.
3. 🎙 Voice → العربية: the next slide is narrated in Arabic; CC shows the Arabic script right-to-left.
4. Watch any slide: each figure, bar, chart segment, row or bullet glows at the moment the voice names it (timed from ElevenLabs' character timestamps); what has been discussed stays readable, the rest steps back.
   The voice hears "riyals" as `ELEVENLABS_RIYAL`; the captions keep the written word.
5. Audio is cached per text and voice, so replaying a deck does not spend credits again.
