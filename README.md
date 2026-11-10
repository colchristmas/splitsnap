# SplitSnap

Snap a receipt, tap who had what, and share everyone's total.

SplitSnap is a mobile-first web app for splitting shopping and restaurant receipts. It reads the receipt **on your device**: there's no cloud OCR, no account and no running cost. Your saved people and past receipts stay in your browser.

> **Status: working end to end, still being tested.**
> - **Working:** scan, review, assign, split, share, history, people/groups, backup, installable PWA.
> - **Known issue:** scanning while offline doesn't work yet; the app itself does load offline.
> - **Next:** real-world testing with iPhone receipt photos, then deploying. See [Roadmap](#roadmap).

---

## Run it

### 1. Requirements

- **Node.js 20.19+ or 22.12+.** Check with `node -v`.
- **A recent browser.** Chrome, Edge, Safari 17+ or Firefox.
- About **100 MB** of disk for dependencies and the OCR models.

### 2. Install

```bash
cd splitsnap
npm install
```

### 3. Start on your computer

```bash
npm run dev
```

Open **http://localhost:5173**.

**To close the app, press Ctrl+C in the terminal.** Closing the browser tab leaves the server running. Ctrl+Z only *pauses* it, and a paused server keeps its port. If you forget, `npm run dev` stops any old SplitSnap server before starting, so the app always uses port 5173. `npm run stop` frees the ports at any time.

The first start also runs `npm run setup:ocr`. That downloads the OCR models (~37 MB) into `public/models/` and copies the ONNX Runtime files into `public/ort/`. The models come from PaddlePaddle's server in Beijing, so the download can be slow, and the script retries if the connection drops. Later starts skip files that are already there.

### 4. Start on your phone (same Wi-Fi)

```bash
npm run dev:phone
```

1. Open https://localhost:5173 on your computer: a small box in the top-right corner shows a QR code of your Wi-Fi address. Scan it with your phone's camera. (Or open one of the `Network:` addresses Vite prints, usually the one on your Wi-Fi interface, e.g. `https://10.0.0.198:5173/`. If the QR code doesn't open, tap **Try address 2 of 3** in the box.)
2. The certificate is self-signed, so the browser will warn you. Choose **Show Details → visit this website** (Safari) or **Advanced → Proceed** (Chrome).
3. Optionally, install it: **Share → Add to Home Screen** on iPhone, or **⋮ → Install app** on Android.

HTTPS is required on the phone because browsers only allow the camera and the fast, multi-threaded scanner on secure pages.

### 5. Try it

1. **People tab:** rename "Me" to your name so shared summaries read well.
2. **Home → Take a photo**, **Upload a photo** or **Paste a screenshot**. On a computer you can also press ⌘V / Ctrl+V on the Home screen. The first scan downloads the scanner once (about 35–40 MB over the network with the default model), and later scans take a few seconds. The download starts as soon as you tap Take or Upload, while you're still picking the photo.
3. **1. Items:** fix any misread names or prices. Tap ⌄ on an item for quantity, coupon and "taxed". Check that the total matches the receipt.
4. **2. People:**
   - Add people. New names are saved automatically, and saved people and groups are one tap away.
   - Pick who paid.
   - Tap people on each item. Items with a quantity can be split **By units**.
5. **3. Split:** see each person's total, grouped by category. Use **Share all** or the share icon on one person, then **Save**.
6. **People tab:** see who owes you what. Tap a person for their bills, then **Mark all settled** when they pay you back.
7. **History → Combine bills:** pick a week's worth of bills and share one total per person.
8. **Spending tab:** see where the money went once a few receipts are saved.

No receipt handy? **Enter items by hand** on the Home screen works the same way.

### Other commands

| Command | What it does |
| --- | --- |
| `npm run stop` | Stop every SplitSnap server (including paused ones) and free their ports |
| `npm test` | Run the unit tests (split engine, receipt parser, share text) |
| `npm run build` | Type-check and build the production site into `dist/` |
| `npm run preview` | Serve the production build at http://localhost:4173 (with the service worker) |
| `npm run deploy` | Build and upload the site to Cloudflare Pages (see [Deploying](#deploying)) |
| `npm run setup:ocr` | Re-download the OCR models / runtime (runs automatically before `dev` and `build`) |
| `npm run lint` | Lint with Oxlint |

### Troubleshooting

- **"Couldn't download the scanner"**: the model download failed. Run `npm run setup:ocr` again; it resumes where it stopped.
- **Scanning is very slow, or never starts**: open the browser console and check that `crossOriginIsolated` is `true`. If it's `false`, the page isn't getting the COOP/COEP headers. Use `npm run dev`, `npm run dev:phone` or `npm run preview`, not a plain file server.
- **The phone can't reach the dev server**: make sure the phone and computer are on the same Wi-Fi, and that your firewall allows incoming connections to Node.
- **"Port 5173 is in use"**: a program other than SplitSnap is using it. SplitSnap's own old servers are stopped automatically. Run `lsof -i :5173` to see what's holding the port.
- **Seeing an old version after an update**: the service worker updates itself on the next load. Reload once more, or clear the site's data.

---

## Features

- **On-device scanning.** PaddleOCR (PP-OCRv6) finds items, quantities, coupons, tax, tip, bag fees and the printed total. Nothing is uploaded.
- **Photos or screenshots.** Take a photo, upload one, or paste a screenshot, such as an online order receipt. Use the **Paste a screenshot** button, or ⌘V / Ctrl+V on a computer.
- **Quick fixes.** Edit, add or remove items and charges. A check compares your total with the receipt's printed TOTAL.
- **Item splits.** Split an item equally between the people you tap, or hand out multi-quantity items unit by unit (3× Coffee: Alex 2, Me 1).
- **Fair shared charges.**
  - Tax, tip and receipt-wide discounts are split by each person's share of the items.
  - Flat fees (bags, deposits, service fees) are split evenly among everyone with at least one item.
  - Each charge has a toggle to switch.
  - If the receipt marks taxed lines (`T`/`TX`), tax is split over those items only.
- **Saved people and groups.** Recent people show first. A group like "Roommates" adds everyone at once.
- **Any payer.** Pick who paid each receipt. Summaries read "Alex owes Sam $12.40".
- **Running balances, like Splitwise but local.**
  - Each person shows what's open between you across saved bills: "Sebastian owes you $14.54" or "You owe Paul $0.49".
  - If you paid, everyone owes you their share; if someone else paid, you owe them yours.
  - Tap a person to see every bill with them, with a running balance. Mark bills settled once you're paid back, one at a time or all at once.
- **Combine bills.** In History, tap **Combine bills** and pick several saved bills.
  - **Share** sends one itemized list per person covering all of them, with each person's total and no "owes" or "paid" wording.
  - The screen also shows each person's balance with you, so you can mark them all settled.
- **Sharing.** Share as text through the phone's share sheet, or copy it to the clipboard.
  - **Share all** lists each person's share neutrally ("Paul: $3.69"). Sharing one person's total says what they owe you.
  - The message appears at the bottom of the split screen (and of Combine bills), where you can edit it before sharing.
  - Edits are saved with the receipt. **Reset** brings back the generated text, and you'll see a note if the split changed after you edited.
- **Categories.**
  - Receipts get a type (Groceries, Dining out, Takeout & delivery…) and items get one too (Produce, Dairy & eggs, Alcohol, Meals…).
  - They're picked automatically from keyword rules. When you change one, SplitSnap remembers it for that store or item next time.
  - You can edit both lists in **Settings → Categories**.
- **Spending.** Totals by receipt type and item type for a month, a year or all time, for everyone or for one person's share.
- **History and backup.** Searchable history with photos and category filters, plus JSON backup export/import (merge or replace).
- **Item and price search.** History's search box also lists matching items with their price, store and date, and the lowest–highest price, so you can compare stores. Type words (`milk`, `costco milk`), a price (`4.99`; `4` finds $4.00–$4.99), a range (`5-10`, `$5 to $10`), a limit (`under 5`, `>20`), or a mix (`milk under 5`). A price filters items by their price and bills by their total.
- **Exact to the penny.** Integer cents and largest-remainder rounding mean shares always add up to the total.

## How it works

### Scanning

1. The photo or screenshot is oriented and downscaled to at most ~4 megapixels, then stored. The size is capped by pixel count rather than the longest side, so tall scrolling screenshots keep readable text.
2. [`@paddleocr/paddleocr-js`](https://www.npmjs.com/package/@paddleocr/paddleocr-js) runs PaddleOCR in a Web Worker on ONNX Runtime Web. It uses WebGPU when available, otherwise multi-threaded WASM.
3. `src/lib/receipt/parse.ts` turns the text boxes into rows and classifies each one:
   - It deskews the boxes and groups them into printed rows.
   - It reads each row's trailing price and keywords to decide whether it's an item, quantity line, coupon, subtotal, tax, tip, fee or total.
   - It ignores payment lines after the total.
4. You review and correct the result.

There are two models; you can switch in **Settings → Scanner**:

| Model | Download | Notes |
| --- | --- | --- |
| Accurate: PP-OCRv6 small (default) | ~31 MB | Best accuracy in testing |
| Fast: PP-OCRv6 tiny | ~6 MB | About 3× faster, with a few more misreads |

`src/lib/ocr/engine.ts` is the scanner loader. It fetches everything the scanner needs, in parallel and with one progress bar: the two model files, the OCR worker (11.3 MB) and the ONNX Runtime WASM (25 MB). It starts on the first scan, when you tap Take or Upload, or from **Settings → Download now**.

- The progress bar uses file sizes measured at build time, so it stays accurate when the host compresses downloads.
- The models are kept in Cache Storage by `engine.ts`, and the worker and runtime by the service worker. A second scan, or a switch to the other model, only downloads what's missing.
- With Accurate, the first scan is about 68 MB of files, roughly 35–40 MB over the network once compressed. With Fast it's about 43 MB, roughly 15 MB.

The SDK also imports OpenCV (10 MB) and Clipper on the main thread, but only uses them when it runs without its worker. SplitSnap always uses the worker, so `src/lib/ocr/sdk-main-thread-stub.ts` replaces them in the build, the same way `ort-stub.ts` does for ONNX Runtime.

### Splitting

`src/lib/split.ts` is a pure function from a receipt to per-person totals:

1. Each item's net price (after its coupon) is divided by its share weights.
2. Proportional charges are divided by each person's item subtotal, and even charges by the number of people with items.
3. Every division goes through `allocate()` in `src/lib/money.ts`, which hands out leftover pennies deterministically.

Items nobody is on yet (or with units left over) are reported as unassigned and block the summary.

### Categories

`src/lib/categories.ts` picks categories in this order:

1. **Your past choices.** Names are normalized first, so "WHOLE MILK 1GAL" matches "whole milk".
2. **Keyword rules.** The most specific keyword wins, so "coffee beans" is Pantry, not Drinks.
3. **Receipt-level signals.** A tip without delivery suggests dining out, a delivery fee suggests takeout, and otherwise the mix of items decides.

At restaurants, food defaults to Meals unless it's clearly a drink or dessert. Categories you set by hand are never overwritten.

`src/lib/spending.ts` totals saved receipts by receipt type and item type, using the split engine for each person's share.

### Search

`src/lib/search.ts` splits what you type into words and at most one price:

- **Words** must all match. For bills they can match the store, the category, a person, or an item. For items they must match the item's name or category, or narrow it by store: `costco milk` finds milk bought at Costco, while `costco` alone lists only bills.
- **A price** is a range, a limit, or an amount that prices start with. A bare number counts as a price only when it's the whole search, so `coke 12` and `milk 4` stay words; write `milk $4` to mean a price.
- An item matches a price through its printed price, its price after coupons, or its price per unit (`3 × $2.00` matches `2`).

### Balances

`src/lib/balances.ts` turns each saved bill into shares between you and each person:

- **You paid:** each person owes you their split total.
- **Someone else paid:** you owe them your total.
- **Not tracked:** debts between two other people.

A person's balance is the sum of the shares that aren't settled. "Settled" is stored per bill and person, so it can be undone. Combining bills adds up the unsettled shares of the bills you pick.

The numbers are checked by a randomized test (`src/lib/combined.test.ts`). It runs 2,000 random sets of bills with random people, payers, coupons, deposits, tax, tip and fees, and settled bills. It checks that:

- every bill, every combined total and every balance adds up to the penny;
- each person's part of every tax, tip, fee and discount is within 1¢ of an independently calculated exact share;
- after random items are deleted, down to the last one, the bill and combined total drop by exactly that item's cost, and the receipt's printed tax and fees stay as they were.

If a saved bill can no longer be fully split, it goes back to **Draft** and stays out of balances and combined bills until you fix it and save again. That happens when an item nobody is on is added, or when every item is deleted but tax or fees remain.

### Storage

All data lives in IndexedDB via [Dexie](https://dexie.org): people, groups, receipts, receipt photos, categories and learned category choices. Upgrading from an older version categorizes existing receipts automatically. Export a backup from **Settings → Backup** to keep a copy or move to another device.

> **iPhone:** Safari may clear data for web apps that aren't installed and haven't been opened for about 7 days. Add SplitSnap to your Home Screen and export a backup now and then.

## Project layout

```
scripts/fetch-ocr-assets.mjs   downloads OCR models + copies ORT WASM into public/
src/
  App.tsx, main.tsx            routes and startup
  screens/                     Home, Scan, Items, Assign, Summary, History, Combine, Spending, People, PersonPage, Settings
  components/                  layouts, form fields, people picker, shared UI
  db/                          Dexie schema, people/groups, receipts, categories, settings, backup, React hooks
  lib/types.ts                 domain types (Person, Group, Receipt, Item, Charge)
  lib/money.ts                 cents parsing/formatting, allocate()
  lib/split.ts                 split engine (+ tests)
  lib/categories.ts            starter categories, keyword rules, guessing and learning (+ tests)
  lib/spending.ts              spending totals by category and person (+ tests)
  lib/search.ts                History search: words, prices, ranges (+ tests)
  lib/balances.ts              balances with each person, combining bills (+ tests)
  lib/share.ts                 share text, Web Share / clipboard (+ tests)
  lib/receipt/parse.ts         OCR boxes → items/charges (+ tests and real OCR fixtures)
  lib/ocr/engine.ts            scanner loader (download with progress, caching), PaddleOCR worker
  lib/ocr/*-stub.ts            keep the SDK's unused main-thread ORT, OpenCV and Clipper out of the build
  lib/ocr/preprocess.ts        photo orientation, rotation, downscaling
public/_headers                Cloudflare Pages response headers (isolation, HSTS)
vite.config.ts                 isolation headers, PWA, stub aliases, scanner file sizes, dev serving of ORT files, LAN HTTPS
```

## Deploying

SplitSnap is a static site: the host only serves files, and the scanner runs on each phone. It's set up for **Cloudflare Pages**, which is free, has unlimited bandwidth and includes HTTPS.

### First time

1. Create a free Cloudflare account at [dash.cloudflare.com](https://dash.cloudflare.com). You don't need a credit card or a domain.
2. In `splitsnap/`, run `npx wrangler login` and approve access in the browser window that opens.

### Each deploy

```bash
npm run deploy
```

This builds `dist/` on your computer (~72 MB, mostly OCR models) and uploads it.

- The first run creates the `splitsnap` project and prints its address, such as `https://splitsnap.pages.dev`. If that name is taken, Cloudflare picks a variant.
- Each deploy also gets its own preview address.

Building on your computer reuses the models already in `public/models/`. A build on Cloudflare from a connected Git repo would download them from Beijing every time.

### What the host has to provide

- **Headers on every response.** `public/_headers` is copied into `dist/` and sets:
  - `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, for the fast, multi-threaded scanner. Without them, scanning is very slow or fails (see [Troubleshooting](#troubleshooting)).
  - `Strict-Transport-Security`, which keeps a custom domain on HTTPS.
- **HTTPS.** The camera, the service worker and the scanner's threads only work on secure pages.
  - Cloudflare issues and renews the certificate automatically.
  - `*.pages.dev` is always HTTPS: the whole `.dev` domain is on browsers' HTTPS-only list.
  - If you add your own domain, also turn on **SSL/TLS → Edge Certificates → Always Use HTTPS** in the Cloudflare dashboard.
- **Files up to 25 MiB.** That's Cloudflare's per-file limit. The largest file, the ORT WASM (25.0 MB), is about 1.2 MB under it, so an ONNX Runtime upgrade could push it over.
- **Deep links.** Cloudflare Pages serves `index.html` for unknown paths when there's no `404.html`, so links like `/r/…/items` work.

Other hosts work if they can set the headers on every response: Netlify reads the same `_headers` file, and Vercel uses `headers` in `vercel.json`. GitHub Pages can't set headers.

Everything the app loads is served by the app itself, so no other cross-origin setup is needed.

## Roadmap

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
- [ ] Fix scanning while offline
- [ ] Test with real receipt photos on iPhone Safari and tune the parser
- [ ] Deploy

Not planned for now: real payments (settling only records that you were paid back), multiple users or sync, cloud OCR, currencies other than USD.

## License

MIT. See [LICENSE](LICENSE).
