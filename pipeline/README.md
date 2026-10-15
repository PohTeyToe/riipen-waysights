# Enrich Account pipeline

Reads a municipality's own public pages, finds its road length and roads contact, keeps the exact line each value came from, checks every value against that line, and proposes changes to a CRM record. When the documents can't settle something, it asks one question.

Weeks 1 to 2 of 8. It runs offline on six example public accounts; the page replays that run.

## Run it

```
uv venv --python 3.12 pipeline/.venv
uv pip install --python pipeline/.venv/Scripts/python.exe -r pipeline/requirements.txt
pipeline/.venv/Scripts/python.exe -m pytest pipeline/tests -q     # no network
pipeline/.venv/Scripts/python.exe -m pipeline.run                 # live fetches, calls the model
pipeline/.venv/Scripts/python.exe -m pipeline.report              # scorecard, SOURCES.md, test count
```

The model step uses the Claude Code CLI (`claude -p`). Swap `extract.PROVIDER` for any client that returns JSON.

## Files

| File | Does |
|---|---|
| `allowlist.py` | The approved sites. Nothing else is fetched. |
| `fetch.py` | Honest user agent, robots.txt, 2 s per host, 15 requests per Account, TLS verified by the OS trust store. Logs every request. |
| `discover.py` | Follows the site's own links (menu first, sitemap if the menu runs out) to the roads pages, contacts and, in Ontario, the asset management plan. |
| `pages.py` | HTML and PDF to text. PDFs are read in reading order, so a table row keeps its label and number together. |
| `nydata.py` | New York: a county's own roads are the sum of `county_mileage` in the NYSDOT dataset. |
| `extract.py`, `prompts/extract.md` | The model step, behind one function. |
| `validate.py` | The five rules. |
| `dedupe.py` | Matches a found person to existing Contacts. Proposes, never merges. |
| `summarize.py`, `prompts/summarize.md` | The four-sentence Account brief, checked sentence by sentence. |
| `writeback.py` | The Zoho requests the run would send. Nothing is sent. |
| `service.py` | The FastAPI service the button calls. Not hosted. |
| `zoho/enrich_account.deluge` | The button's function. Draft, never run in a Zoho org. |
| `run.py`, `report.py` | The offline run and the scorecard. |

## The five rules (`validate.py`)

1. Every value must appear in its quote, and the quote must appear in the saved source text. A sum of printed parts is allowed if each part passes. Ratios, percentages and other derived numbers are rejected.
2. Road length must be a length. Lane-km and area are rejected. A length that doesn't say centerline goes to a person.
3. New York: a county's owned roads are the sum of `county_mileage`. The all-roads total is shown beside it, never used as the value.
4. Sources that give different numbers go to a person with both quotes and a one-click pick. No tolerance rules.
5. Emails and phones must be printed on an approved page. Summary sentences must cite a page this run read, and every number in them must be a checked value.
