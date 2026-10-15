"""After the run: score it against the answer key, count the tests, and list
every source. Writes data/scorecard.json, data/SOURCES.md and updates
data/run/meta.json.

    python -m pipeline.report
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from collections import Counter

from .run import DATA, OUT, ROOT, git

FIELDS = ["road_length_km", "roads_head_name", "roads_head_title", "email", "phone", "key_document"]
POST_NOMINALS = r"\b(p\.?\s?e\.?|p\.?\s?eng\.?|jr|sr|phd)\b"


def norm_text(s: str | None) -> str:
    s = re.sub(POST_NOMINALS, " ", (s or "").lower())
    return " ".join(re.sub(r"[^a-z0-9@.]+", " ", s).replace(" .", " ").split()).strip(". ")


def digits(s: str | None) -> str:
    return re.sub(r"\D", "", s or "")


def same_page(url: str) -> str:
    """Compare URLs the way a person would: scheme, www. and a trailing slash don't matter."""
    return re.sub(r"^https?://(www\.)?", "", url.lower()).rstrip("/")


def got_values(run: dict) -> dict:
    v = run["validated"]
    road = v["road_length_km"]
    head = v["roads_head"]
    return {
        "road_length_km": {"status": road["status"], "value": road.get("value_km"),
                           "options": [o["km"] for o in road.get("options", [])]},
        "roads_head_name": head.get("name") if head.get("status") == "filled" else None,
        "roads_head_title": head.get("title") if head.get("status") in ("filled", "title_only") else None,
        "email": v["email"].get("value"),
        "phone": v["phone"].get("value"),
        "key_document": [d["url"] for d in v["key_documents"]],
    }


def score_road(key: dict, got: dict) -> dict:
    accepted = [round(x, 1) for x in key.get("accepted_options_km", [])]
    status, value = got["status"], got["value"]
    if status == "needs_human":
        return {"outcome": "sent_to_person", "key_agrees_unclear": key["expect"] == "needs_human",
                "options_include_accepted": any(round(o, 1) in accepted for o in got["options"]),
                "got": got["options"]}
    if status == "filled":
        ok = key["expect"] == "filled" and round(value, 1) in accepted
        return {"outcome": "right" if ok else "wrong", "got": value}
    return {"outcome": "correctly_blank" if key["expect"] == "blank" else "missed", "got": None}


def score_simple(key: dict, got, same) -> dict:
    if got in (None, "", []):
        return {"outcome": "correctly_blank" if key["expect"] == "blank" else "missed", "got": None}
    if key["expect"] == "blank":
        return {"outcome": "wrong", "got": got}
    return {"outcome": "right" if any(same(got, a) for a in key["accepted"]) else "wrong", "got": got}


def miss_reason(run: dict, field: str, outcome: str, key_field: dict) -> str:
    base = {"roads_head_name": "roads_head", "roads_head_title": "roads_head", "key_document": "key_documents"}
    f = base.get(field, field)
    row = next((r for r in run["proposed"] if r["field"] == f), {})
    if outcome != "missed":
        cites = row.get("sources") or []
        took = "; ".join(f"\"{c.get('quote', c.get('title', ''))}\" ({c['url']})" for c in cites[:2])
        key_note = key_field.get("why") or (f"key source: {key_field['source']}" if key_field.get("source") else "")
        return " ".join(x for x in (f"The run took {took}." if took else "", f"Key: {key_note}" if key_note else "") if x)
    rejected = [f"{r['value']} ({r['reason']})" for r in run["rejected"] if r["field"] == f]
    errors = [f"{e['url']}: {e['reason']}" for e in run.get("fetch_errors", [])]
    parts = [row.get("detail") or ""]
    if rejected:
        parts.append("Rejected by the checks: " + "; ".join(rejected) + ".")
    if run["run"]["pages_read"] == 0 and errors:
        parts.append("Fetch errors: " + "; ".join(errors) + ".")
    return " ".join(p for p in parts if p).strip() or "The run did not find it."


def score() -> dict:
    key = json.loads((DATA / "answer_key.json").read_text(encoding="utf-8"))
    rows, misses = [], []
    for slug, k in key["accounts"].items():
        path = OUT / f"{slug}.json"
        if not path.exists():
            continue
        run = json.loads(path.read_text(encoding="utf-8"))
        got = got_values(run)
        for field in FIELDS:
            if field == "road_length_km":
                r = score_road(k[field], got[field])
                expected = (k[field].get("accepted_options_km") or "blank") if k[field]["expect"] != "filled" \
                    else k[field]["value_km"]
            elif field == "key_document":
                hit = {u for u in got[field] if same_page(u) in {same_page(a) for a in k[field]["accepted_urls"]}}
                r = {"outcome": "right" if hit else "missed", "got": sorted(hit) or got[field]}
                expected = k[field]["accepted_urls"]
            else:
                same = (lambda a, b: digits(a) == digits(b)) if field == "phone" else \
                       (lambda a, b: norm_text(a) == norm_text(b))
                r = score_simple(k[field], got[field], same)
                expected = k[field]["accepted"] or "blank"
            r.update(account=slug, field=field, expected=expected, key_expect=k[field].get("expect"))
            if r["outcome"] in ("wrong", "missed") or (r["outcome"] == "sent_to_person" and not r["key_agrees_unclear"]):
                r["why"] = miss_reason(run, field, r["outcome"], k[field])
                misses.append(r)
            rows.append(r)
    counts = Counter(r["outcome"] for r in rows)
    return {
        "about": "The run scored against data/answer_key.json, which was written before the first run by reading "
                 "the sources directly and committed on its own. Rules for each outcome are in the key.",
        "answer_key_commit": git("log", "--diff-filter=A", "--format=%H", "--", "data/answer_key.json"),
        "counts": {o: counts.get(o, 0) for o in ["right", "wrong", "correctly_blank", "missed", "sent_to_person"]},
        "sent_to_person_key_agrees": sum(1 for r in rows if r["outcome"] == "sent_to_person" and r["key_agrees_unclear"]),
        "total": len(rows),
        "misses": misses,
        "rows": rows,
    }


def run_tests() -> dict:
    proc = subprocess.run([sys.executable, "-m", "pytest", "pipeline/tests", "-q", "-p", "no:cacheprovider"],
                          cwd=ROOT, capture_output=True, text=True)
    tail = proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else proc.stderr[-200:]
    m = re.search(r"(\d+) passed", tail)
    f = re.search(r"(\d+) failed", tail)
    return {"passed": int(m.group(1)) if m else 0, "failed": int(f.group(1)) if f else 0, "summary": tail,
            "network": "none: fixtures are saved copies of the pages"}


def sources_md(meta: dict) -> str:
    runs = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(OUT.glob("*.json"))
            if p.stem not in ("meta", "context")}
    ctx = json.loads((OUT / "context.json").read_text(encoding="utf-8"))
    out = [
        "# Sources",
        "",
        f"Everything the run read, with the date, HTTP status and sha256 of what came back. Run date "
        f"{meta['run_date']}, user agent `{meta['user_agent']}`, robots.txt obeyed, at least "
        f"{meta['min_delay_s']:g} s between requests to one host, at most {meta['page_budget']} requests per Account.",
        "",
        "## Collected, generated, made up",
        "",
        "- **Collected (real, fetched on the run date):** every page, PDF and dataset row listed below. "
        "`run/pages/{slug}.json` holds the exact text each quote was checked against: the page text for web pages, "
        "only the pages used for PDFs (whole third-party PDFs are not committed; their sha256 is below). "
        "`pipeline/tests/fixtures/` keeps saved copies of five pages and one PDF page for the tests "
        "(origins and sha256 in `fixtures/SOURCES.json`).",
        f"- **Generated by the run:** `run/{{slug}}.json` (log, extractions, checks, rejections, proposed changes, "
        f"questions, merge proposal, Zoho payload preview) and the Account briefs. The model calls went through the "
        f"Claude Code CLI; model id as reported by the CLI: `{meta['model']}`.",
        "- **Generated after the run:** `scorecard.json` (the run against the answer key) and this file.",
        "- **Written by hand before the first run:** `answer_key.json`, by reading the sources directly "
        f"(commit `{meta.get('answer_key_commit', '')[:12]}`).",
        "- **Made up (`mock: true`):** `accounts.seed.json`, the CRM state before the run: record ids, Account type, "
        "blank fields, enrichment status, and one earlier Contact on Warren County (\"K. Hajos, Highway "
        "Superintendent\", with the DPW phone the county prints). The six Account names and websites are real "
        "public bodies, used as example public accounts.",
        "",
    ]
    for slug, run in runs.items():
        a = run["account"]
        out += [f"## {a['name']} ({slug})", "", "| # | URL | Fetched (UTC) | HTTP | Bytes | sha256 | How it was reached |",
                "|---|---|---|---|---|---|---|"]
        for s in run["sources"]:
            pages = f" (PDF pages read: {', '.join(map(str, s['pdf_pages_read']))} of {s['pdf_page_count']})" \
                if s.get("pdf_pages_read") else ""
            out.append(f"| {s['id']} | {s['url']}{pages} | {s['fetched_at']} | {s['status']} | {s['bytes']} | "
                       f"`{s['sha256'][:16]}` | {s['found_via'].replace('|', '/')} |")
            if s.get("dataset"):
                m = s["dataset"]["meta_record"]
                out.append(f"| {s['id']} | {m['url']} (column descriptions) | {m['fetched_at']} | {m['status']} | "
                           f"{m['bytes']} | `{m['sha256'][:16]}` | dataset metadata |")
        fails = [ln for ln in run["steps"] if ln["step"] in ("error",) or
                 (ln["step"] == "fetch" and ln.get("status", 200) >= 400)]
        if fails:
            out += ["", "Requests that failed: " + "; ".join(f"{ln.get('url')} ({ln['msg']})" for ln in fails) + "."]
        out.append("")
    out += ["## Context for the Account briefs", "",
            "Read once per run. Waysights' pages are used for vocabulary only; the two sign rules are kept only "
            "if the quoted sentence is really in the fetched file.", "",
            "| ID | URL | Fetched (UTC) | HTTP | sha256 |", "|---|---|---|---|---|"]
    for c in ctx["sources"]:
        out.append(f"| {c['id']} | {c['url']} | {c['fetched_at']} | {c['status']} | `{c['sha256'][:16]}` |")
    out += ["", "## How the run was made", ""] + DEV_NOTES
    out += ["", "## Changes to the answer key after the run", "", "None."]
    return "\n".join(out) + "\n"


# Written by hand: what changed between the answer key and the final run.
DEV_NOTES = [
    "The answer key was committed before the pipeline ran at all. The pipeline was then built and run several "
    "times on these same six Accounts (some runs from a local fetch cache), so the scorecard checks it on pages it "
    "was developed against. It is a check, not a benchmark. The outputs in `run/` are from one final live run with "
    "no cache, at the pipeline commit in `run/meta.json`.",
    "",
    "Changes made after development runs, each a general fix rather than a per-site rule:",
    "",
    "- Discovery read the sitemap too early and spent the budget on project pages; it now reads the sitemap only when "
    "the site's menu runs out, skips project and construction pages, and treats URLs that differ only in their "
    "query string as one page.",
    "- Text after a `<br />` was dropped on one page (Saratoga County's contact block); it is now kept, with a test.",
    "- lincoln.ca sends an incomplete certificate chain; TLS is now verified by the operating system's trust store, "
    "which completes the chain and still rejects bad certificates.",
    "- PDF page picking missed table rows whose unit is in the label (\"kms of local roads 255\"); fixed, with a test.",
    "- One development run judged Lincoln's 255 + 55 km as part of the network because arterial roads show as 0; the "
    "extraction prompt now says a type given as zero, or roads another government owns, doesn't break coverage.",
    "- The brief writer is now told which numbers it may use, and not to attach a department's phone to a person.",
    "- The New York dataset query got its own small request budget after long crawls used all 15 requests.",
    "- Scoring compares URLs ignoring `https://`, `www.` and a trailing slash (decided after a development run "
    "listed www.warrencountyny.gov/dpw for the key's warrencountyny.gov/dpw).",
]


def main() -> None:
    card = score()
    (DATA / "scorecard.json").write_text(json.dumps(card, indent=1, ensure_ascii=False), encoding="utf-8")
    meta_path = OUT / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta["tests"] = run_tests()
    meta["answer_key_commit"] = card["answer_key_commit"]
    meta_path.write_text(json.dumps(meta, indent=1), encoding="utf-8")
    (DATA / "SOURCES.md").write_text(sources_md(meta), encoding="utf-8")
    print(json.dumps({"counts": card["counts"], "misses": [(m["account"], m["field"], m["outcome"]) for m in card["misses"]],
                      "tests": meta["tests"]["summary"]}, indent=1))


if __name__ == "__main__":
    main()
