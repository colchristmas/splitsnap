# SplitSnap roadmap

What's done, what's next, and what might come later. Each open item says why it's on the list.

## Done

- [x] OCR spike: model choice, worker and threading setup, isolation headers
- [x] Split engine, receipt parser and share text, with tests
- [x] Storage: people, groups, receipts, photos, settings
- [x] Screens: Home, Scan, Items, Assign, Split, History, Spending, People, Settings
- [x] Paste screenshots
- [x] Receipt and item categories with learning, spending totals
- [x] Running balances, activity per person, combine bills, mark settled
- [x] JSON backup export/import, storage persistence
- [x] Installable PWA (the app shell works offline)
- [x] Item and price search in History
- [x] Optional accounts with end-to-end encrypted sync (Supabase)
- [x] Deploy setup: complete scanner loader, smaller OCR download, Cloudflare Pages config

## Next: before sharing the app

- [ ] **Deploy** with `npm run deploy` (see [Deploying](README.md#deploying)), then check the live site:
  - every response carries the COOP, COEP and HSTS headers (`curl -sI` on `/`, a deep link and the ORT WASM);
  - `http://` redirects to `https://`, and the WASM arrives compressed;
  - on a phone, `crossOriginIsolated` is `true`, the camera opens and the app installs.
- [ ] **Test with real receipts** on iPhone Safari and Android Chrome, and tune the parser on what it misreads.
- [ ] **Check scan speed on phones.** In headless Chrome on a desktop, reading a receipt took about 31 seconds in every build tested, not the few seconds the README promises. If phones are slow too, compare WebGPU with WASM, the Fast model and a smaller input image.
- [ ] **Fix scanning while offline.** The loader now caches every scanner file, so test again first. If it still fails, find which request fails with the network off.
- [ ] **Test accounts and sync** against a live Supabase project, on iPhone Safari and desktop.

## After that

- [ ] **A smaller first load.** The main script is over Vite's 500 KB warning (570 KB when last measured). Load the less-used screens (Spending, Combine, Settings, Account) on demand, as the Supabase client already is.
- [ ] **Stay under Cloudflare's 25 MiB file limit.** The ORT WASM is about 1.2 MB under it, so check its size before upgrading ONNX Runtime. If an upgrade pushes it over, serve it from Cloudflare R2 with a `Cross-Origin-Resource-Policy` header, or switch to ONNX Runtime's smaller WASM-only build, which has no WebGPU.
- [ ] **Change the account email.** The email is part of the key derivation, so a change has to re-derive the keys from the password and new email, re-wrap the vault key, and update the email and auth secret in Supabase.
- [ ] **End-to-end tests.** Turn the browser checks used during development (scan a receipt, search History, Settings' download state) into a Playwright suite run by `npm run test:e2e`.
- [ ] **CI.** Run `npm test`, `npm run lint` and `npm run build` on every push with GitHub Actions. Cache `public/models/`, so each run doesn't download the models from Beijing.
- [ ] **Clear the six Oxlint warnings:** state set inside effects, and files that export more than components (which breaks Fast Refresh).

## Ideas

- **Price history for an item:** what you paid for "milk" over time and at each store, opened from the search results.
- **More search phrasing:** "up to 5", "at least 20", and dates like "october" or "last week".
- **Highlight the matching words** in search results.

## Not planned for now

Real payments (settling only records that you were paid back), shared bills between accounts, cloud OCR, currencies other than USD.
