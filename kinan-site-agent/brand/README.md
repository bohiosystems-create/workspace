# Brand

Kinan's artwork, shared with the marketing assistant (`marketing-hub/brand/`):

- `kinan-logo.svg` — the logo (charcoal vector; drawn white on dark bands)
- `kinan-chevron.svg` — the orange chevron
- `kinan-texture.jpg` — the faceted page texture from the collateral

`npm run brand` (also run before `npm run build` and `npm run build:html`) embeds them into `lib/brand-assets.ts`,
used by the header, the boot screen, the home-screen icon, the WhatsApp map images and the drawing title blocks.
Replace a file here and run it again to update the artwork everywhere.

## Typeface

Kinan's collateral and kinan.com.sa are set in **Greta Arabic / Greta Sans** (Typotheque), a licensed font that is
not shipped here. To use it in the app, copy the licensed files into `brand/fonts/` (any of `.woff2`, `.woff`,
`.ttf`, `.otf`; the weight and style are read from the file name, e.g. `GretaSansPro-Bold.woff2`,
`GretaArabic-Regular.ttf`) and run `npm run brand`. They are embedded under one family name, `Kinan`, and the whole
UI (plus the 2D sheet and the 3D ground labels) switches to it. The files stay out of git (`brand/fonts/.gitignore`).

Without them, **Fira Sans** (a humanist sans of the same colour and proportions as Greta Sans) and **IBM Plex Sans
Arabic** stand in, loaded from Google Fonts.
