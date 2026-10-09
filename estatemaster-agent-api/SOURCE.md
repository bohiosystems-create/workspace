# EstateMaster API option: source

This demo deploys separately from Option 2 (its own folder here, its own Vercel project `kinan-estatemaster-api`), but it
mirrors Option 2: `tools/mirror_from_option2.py` rebuilds `index.html`, `api/`, `vercel.json` and `package.json` from
Option 2's current source plus the API patch (the simulated EstateMaster API, the approval flow that writes through it,
the wording). Run it after every Option 2 build, before copying this folder to `bohio-demos/kinan-estatemaster-api/`
(keep that folder's `middleware.js`). The API-only code blocks live in `tools/api_blocks.json`.
