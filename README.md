# Enrich Account

Enrich Account for Waysights, built to roughly where weeks 1 to 2 of the Riipen Level UP project (October 2026) would end: a small Python service that reads a municipality's own public pages, finds its road length and its roads contact, keeps the exact line each value came from, checks every value against that line, and proposes changes to a Zoho CRM Account. When the documents can't settle something, it asks one question with a one-click answer instead of guessing.

The outputs in `data/` come from one final run on six real municipalities on Oct 15, 2026, and the web page replays that run. Nothing on the page runs live, and nothing is sent to Zoho.

## What's here

| Path | What it is |
|---|---|
| `pipeline/` | The Python service: fetcher, discovery, PDF reading, the model step, the five validation rules, duplicate check, Account brief, Zoho write-back builder, FastAPI service, Deluge button draft, and offline tests. See `pipeline/README.md`. |
| `data/` | The run's real outputs (`run/`), the answer key written before the first run, the scorecard, the sample CRM state, and `SOURCES.md` (every page with its fetch time, HTTP status and hash, and every change made along the way). |
| `src/` | The page (Vite, React, TypeScript). It reads `data/` as is and shows the pipeline files as read-only code. It never regenerates anything. |

## The page

- `/` A short walkthrough: Tompkins County before and after (its road length, roads head, email, phone and brief, each with the line it came from), and the one question only Waysights can answer: does pricing count the roads a county owns, or every road inside it.
- `/demo` A CRM-style Account record. Press **Enrich Account** to replay the run log for that Account (about 10 seconds, with a skip), then see each proposed change with its quoted line, source link, PDF page and fetch date. Every quote can be opened in place in the saved page text it was checked against. Answer the question, look at what validation rejected, and preview the exact Zoho requests (nothing is sent).
- `/demo/zoho` The Zoho side: the button flow and the Deluge, write-back and service code, read straight from `pipeline/`.
- `/demo/plan` What I'd own, one way to split the rest, the brief item by item, and five questions only Waysights can answer. Two of them are policy questions: one answer settles every Account like it.

## Run it

Node 20.19 or newer.

```
npm install
npm run dev        # http://localhost:5103
npm test           # checks the page against the run's real outputs
npm run build      # static site in dist/
```

The pipeline has its own setup and tests (Python 3.12, no network for the tests); see `pipeline/README.md`.

## Deploy

Static site, no backend, no secrets, no environment variables. Vercel builds it as is from the repo root (`vercel.json` sets the build, the output folder, the client-side routes and a `noindex` header). `.vercelignore` keeps the Python environment and fetch cache out of the upload.

## Data sources

- **The six municipalities' own websites**, fetched on Oct 15, 2026 with an honest user agent, robots.txt obeyed, 2 seconds between requests per host and at most 15 pages per Account (robots.txt and redirects are extra requests; the run log shows every one): Town of Lincoln, Town of Pelham and Township of West Lincoln (Ontario); Saratoga, Warren and Tompkins Counties (New York).
- **NYSDOT Highway Mileage on data.ny.gov** (dataset `tccz-tc3t`, year 2020) for the New York counties, with its own budget of 3 requests: `county_mileage` summed for roads the county owns, `total_centerline_highway_mileage` shown beside it.

Every page, with fetch time, HTTP status and hash, is in `data/SOURCES.md`. Whole third-party PDFs are not committed; `data/run/pages/` keeps the text of the pages a value was taken from or refused from.

## Real or mock

| Thing | Real or mock |
|---|---|
| Fetched pages, PDF pages, data.ny.gov rows | Real, fetched Oct 15, 2026. Every value shows its source link, page and fetch date. |
| Run log, extractions, rejections, questions, merge proposal, Account briefs, Zoho payloads | Real outputs of the offline run, replayed. The briefs carry the model id (`claude-opus-5-5`). |
| The six Account names and websites | Real public bodies, shown as example public accounts. Not leads or customers. |
| CRM state before the run: record ids, Account type, blank fields, status, and one earlier Contact on Warren County ("K. Hajos, Highway Superintendent") | Made up (`data/accounts.seed.json`, `mock: true`). Tagged "sample" on the page. |
| Zoho field API names, the Deluge function and the write-back code | Draft. Never run in a Zoho org; the field names are guesses. |
| Answers given on the page | Local page state only. They change the preview, never the run's data. |

## How it was checked

The answer key (`data/answer_key.json`) was written by reading the sources directly and committed on its own (`f7023e6`) before the pipeline first ran, and it hasn't changed since. The scorecard (`data/scorecard.json`) compares the final run against it: 24 right, 2 wrong, 7 correctly left blank, 0 missed, 3 sent to a person. Both wrong rows come from one rule added after review: two road lengths within 2% are the same roads. The key sends Warren's and Tompkins' road length to a person, and the run now fills each with one of the two figures the key lists, which the key's rules count as wrong. The key agrees on 2 of the 3 sent to a person. On the third, Pelham's phone, the key takes the contacts directory's ext. 33, and the run sends it to a person because another town page prints x332. `data/SOURCES.md` lists every change made along the way. The pipeline was developed against these same six Accounts, so this is a check, not a benchmark.
