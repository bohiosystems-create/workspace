# Brand

Kinan's artwork, shared with the marketing assistant (`marketing-hub/brand/`):

- `kinan-logo.svg` — the logo (charcoal vector; drawn white on dark bands)
- `kinan-chevron.svg` — the orange chevron
- `kinan-texture.jpg` — the faceted page texture from the collateral

`npm run brand` (also run before `npm run build` and `npm run build:html`) embeds them into `lib/brand-assets.ts`,
used by the header, the boot screen, the home-screen icon, the WhatsApp map images and the drawing title blocks.
Replace a file here and run it again to update the artwork everywhere.
