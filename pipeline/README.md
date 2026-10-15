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
| `fetch.py` | Honest user agent, robots.txt, 2 s per host, 15 pages per Account (robots.txt and redirects counted separately), TLS verified by the OS trust store. Logs every request. |
| `discover.py` | Follows the site's own links (menu first, sitemap if the menu runs out) to the roads pages, contacts, sign pages and, in Ontario, the newest asset management plan. A link counts on its own words, not the folder it sits in or another department's name. |
| `pages.py` | HTML and PDF to text. PDFs are read in reading order, so a table row keeps its label and number together. |
| `nydata.py` | New York: a county's own roads are the sum of `county_mileage` in the NYSDOT dataset. |
| `extract.py`, `prompts/extract.md` | The model step, behind one function. |
| `validate.py` | The five rules. |
| `dedupe.py` | Matches a found person to existing Contacts. Proposes, never merges. |
| `summarize.py`, `prompts/summarize.md` | The Account brief: what the municipality says about its signs, and who to ask for. Checked sentence by sentence. |
| `writeback.py` | The Zoho requests the run would send: the Account updated by its id, the Contact, the Notes. Nothing is sent. |
| `service.py` | The FastAPI service the button calls. Not hosted. |
| `zoho/enrich_account.deluge` | The button's function. Draft, never run in a Zoho org. |
| `run.py`, `report.py` | The offline run and the scorecard. |

## The five rules (`validate.py`)

1. Every value must appear in its quote, and the quote must appear in the saved source text. A road length's unit must be printed next to its number, and a money amount is never a length. A sum of printed parts is allowed if each part passes and uses each printed number once. Ratios, percentages, areas (m2 or km² included) and other derived numbers are rejected.
2. Road length must be a length. Lane-km and area are rejected. A length that doesn't say centerline goes to a person.
3. New York: a county's owned roads are the sum of `county_mileage`. The all-roads total is shown beside it, never used as the value.
4. Sources that give different numbers go to a person with every quote. Two figures agree, and count as one, when they're within 2% of each other (the same roads measured twice; the 2% is one setting, `NEAR`) or when an approximate one is the precise one rounded at the precision it is printed with ("approximately 300 km" and 310 km). The precise figure is kept, from the Account's own pages before the state's data, and the other is shown beside it. Two different phone numbers for the department go to a person too.
5. Emails and phones must be printed whole on an approved page: part of a longer address or extension doesn't count. Summary sentences must cite a page this run read, every number in them must be a checked value, each must share a checked value or four words in a row with every page it cites, and every word in them must be printed on a page they cite, apart from a short list of connecting words.
