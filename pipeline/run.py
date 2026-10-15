"""Offline run: enrich each sample Account and write what the page replays.

    python -m pipeline.run                 # all six, live fetches
    python -m pipeline.run lincoln warren  # some
    python -m pipeline.run --cached        # reuse pages already in the local fetch cache (dev only)

Writes data/run/{slug}.json, data/run/pages/{slug}.json (the exact text every
quote was checked against), data/run/context.json and data/run/meta.json.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlsplit

from . import dedupe, nydata, summarize, writeback
from .allowlist import APPROVED, CONTEXT
from .discover import Discovery, Source
from .extract import extract
from .fetch import MIN_DELAY_S, PAGE_BUDGET, USER_AGENT, Fetcher, HostClock, RunLog, now_iso
from .validate import NEAR, Checker, fmt_km, short_title

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "run"
CACHE = Path(__file__).resolve().parent / ".cache" / "raw"
STATES = {"ON": "Ontario", "NY": "New York"}


def count(n: int, one: str, many: str | None = None) -> str:
    """'1 road line', '2 road lines'."""
    return f"{n} {one if n == 1 else many or one + 's'}"


def agree_lines(keep: dict) -> str:
    """Why the figures other sources give are shown beside the one kept instead of as second options."""
    groups: dict[tuple, list[dict]] = {}
    for a in keep.get("agrees", []):
        groups.setdefault((a.get("agrees_by", "rounded"), a["value"], a["unit"]), []).append(a)
    out = []
    for (how, value, unit), parts in groups.items():
        a = parts[0]
        srcs = " and ".join(dict.fromkeys(short_title(p["cite"]["title"]) for p in parts))
        if how == "rounded":
            out.append(f"{srcs} {'says' if len(parts) == 1 else 'say'} about {value} {unit}: the same figure, "
                       f"rounded, so it isn't a second option.")
            continue
        pct = abs(a["km"] - keep["km"]) / keep["km"] * 100
        line = (f"{srcs} {'gives' if len(parts) == 1 else 'give'} {fmt_km(a['km'], a['approximate'])} ({value} {unit}), "
                f"{pct:.1f}% {'more' if a['km'] > keep['km'] else 'less'}. Figures within {NEAR:.0%} are the same "
                f"roads, so it isn't a second option.")
        if a["centerline"] and not all(p["centerline"] for p in keep["parts"]):
            line += " It says centerline, so this figure counts as centerline."
        out.append(line)
    return " ".join(out)


def load_seed() -> dict:
    return json.loads((DATA / "accounts.seed.json").read_text(encoding="utf-8"))


def account_from_seed(row: dict) -> dict:
    state = row["Billing_State"]
    return {"slug": row["slug"], "crm_id": row["crm_id"], "name": row["Account_Name"], "website": row["Website"],
            "jurisdiction": state, "region": STATES[state],
            "ny_county": row["Account_Name"].replace(" County", "").upper() if state == "NY" else None}


def key_documents(sources: list[Source], fields: dict, sign_work: list[dict]) -> list[dict]:
    """The plan (if read), the page each checked value came from (the first one, when
    several pages print the same thing), and the pages where the town describes its sign work."""
    cited = {c["source"] for f in ("roads_head", "email", "phone") for c in [fields[f].get("cite")] if c}
    cited |= {c["source"] for c in fields["phone"].get("cites", [])}
    cited |= {o["parts"][0]["cite"]["source"] for o in fields["road_length_km"].get("options", [])}
    cited |= {s["source"] for s in sign_work}
    docs = []
    for s in sources:
        if s.id in cited or (s.kind == "pdf" and s.pdf_pages):
            docs.append({"title": short_title(s.title), "url": s.url, "source": s.id, "kind": s.kind,
                         "fetched_at": s.record["fetched_at"]})
    return docs


def field_rows(account: dict, seed: dict, fields: dict, proposal: dict | None, brief: dict, sources: list[Source],
               rejected: list[dict]) -> list[dict]:
    """The proposed-changes table: Current, Proposed, Source, Status."""
    read = len([s for s in sources if s.kind in ("html", "pdf")])
    hidden = sum(s.notes.get("hidden_emails", 0) for s in sources)

    def why_blank(field: str) -> str:
        reasons = [f"{r['reason']}: {r['value']}" for r in rejected if r["field"] == field and r.get("value")]
        base = f"Not printed on the {read} pages read."
        if field == "email" and hidden:
            base = (f"The site hides {'an address' if hidden == 1 else 'addresses'} from scripts "
                    f"(Cloudflare email protection). The crawler doesn't decode it.")
        return " ".join([base] + [f"Rejected: {r}." for r in reasons])

    road = fields["road_length_km"]
    road_row = {"field": "road_length_km", "label": "Road network (centerline km)",
                "current": seed.get("Road_Network_Centerline_km"), "status": road["status"],
                "sources": [p["cite"] for o in road.get("options", []) for p in o["parts"] + o.get("agrees", [])]}
    agreeing = [o for o in road.get("options", []) if o.get("agrees")]
    if agreeing:
        road_row["detail"] = agree_lines(agreeing[0])
    if road["status"] == "filled":
        road_row["proposed"] = fmt_km(road["value_km"])
    elif road["status"] == "needs_human":
        o = road["options"][0]
        parts = o["parts"]
        detail = " + ".join(f"{p['value']} {p['road_type']}" for p in parts) if len(parts) > 1 else None
        road_row.update(proposed=fmt_km(o["km"], o["approximate"]) + (f" ({detail})" if detail else ""),
                        question=road["question"])
    else:
        road_row["proposed"] = None
        road_row["detail"] = "No total road length in the sources read."
        if road.get("partial"):
            road_row["partial"] = [{"km": p["km"], "why": p["why"], "sources": [x["cite"] for x in p["parts"]]}
                                   for p in road["partial"]]
    if road.get("within_km") is not None:
        road_row["within"] = {"km": road["within_km"], "mi": road["within_mi"], "column": road["within_column"],
                              "year": road["data_year"],
                              "note": "Using roads the county owns. Question 1 for you."}

    rows = [road_row]
    for f, label, seed_key in (("email", "Public Works email", "Public_Works_Email"),
                               ("phone", "Public Works phone", "Public_Works_Phone")):
        v = fields[f]
        row = {"field": f, "label": label, "current": seed.get(seed_key), "status": v["status"],
               "proposed": v.get("value"), "sources": [v["cite"]] if v.get("cite") else v.get("cites", [])}
        if v["status"] == "not_found":
            row["detail"] = why_blank(f)
        elif v["status"] == "needs_human":
            row["detail"] = (f"The pages print {len(v['values'])} different numbers for the department. Left blank; "
                             f"a Note on the Account keeps each one with its page.")
        rows.append(row)

    head = fields["roads_head"]
    head_row = {"field": "roads_head", "label": "Roads head", "current": None,
                "sources": [head["cite"]] if head.get("cite") else []}
    if head["status"] == "filled":
        head_row.update(proposed=f"{head['name']}, {head['title']}" if head.get("title") else head["name"],
                        status="merge" if proposal and proposal["action"] == "merge" else "filled")
        if proposal and proposal["action"] == "merge":
            head_row["current"] = f"{proposal['existing']['name']}, {proposal['existing']['title']}"
            head_row["merge"] = proposal
    elif head["status"] == "title_only":
        head_row.update(proposed=None, status="not_found",
                        detail=f"The site lists the role without a name: {head['title']}.")
    else:
        head_row.update(proposed=None, status="not_found", detail=why_blank("roads_head"))
    rows.append(head_row)

    docs = fields["key_documents"]
    rows.append({"field": "key_documents", "label": "Key documents", "current": seed.get("Key_Documents"),
                 "status": "filled" if docs else "not_found", "proposed": [d["title"] for d in docs],
                 "sources": [{"url": d["url"], "title": d["title"], "fetched_at": d["fetched_at"]} for d in docs]})
    brief_row = {"field": "brief", "label": "Account brief", "current": seed.get("Account_Brief"),
                 "status": "filled" if brief["sentences"] else "not_found",
                 "proposed": " ".join(s["text"] for s in brief["sentences"]) or None, "sources": []}
    if not brief["sentences"]:
        brief_row["detail"] = brief.get("skipped") or "No sentence passed the checks."
    rows.append(brief_row)
    return rows


def enrich(row: dict, seed: dict, clock: HostClock, context: list[Source], cached: bool) -> dict:
    account = account_from_seed(row)
    slug = account["slug"]
    log = RunLog(slug)
    started = now_iso()
    log("status", "Queued")
    log("status", "Running", rate_rule="One run per Account per day. Last run: never.")
    host = urlsplit(account["website"]).hostname
    log("allowlist", f"{host} is on the approved list", approved=APPROVED[slug])

    f = Fetcher(APPROVED[slug], log, clock, cache_dir=CACHE, cached=cached)
    sources = Discovery(f, account["website"], wants_plan=account["jurisdiction"] == "ON").run()
    readable = [s for s in sources if s.kind in ("html", "pdf")]
    log("read", f"{count(len(readable), 'page')} read, {f.used} of {f.budget} page fetches used")
    dataset, nyf = None, None
    if account["ny_county"]:
        # The state dataset is its own source with its own small budget, so a long crawl can't crowd it out.
        nyf = Fetcher([e for e in APPROVED[slug] if e == "data.ny.gov"], log, clock, budget=3, cache_dir=CACHE, cached=cached)
        dataset = nydata.county_mileage(nyf, account["ny_county"], f"S{len(sources) + 1}")
        if dataset:
            sources.append(dataset)

    contacts = [c for c in seed["contacts"] if c["account"] == slug]
    if readable:
        log("extract", f"sending {count(len(readable), 'source')} to the model")
        extraction, model_id, prompt = extract(account, sources)
        log("extract", f"model returned {count(len(extraction.get('road_lines') or []), 'road line')}, "
                       f"{'a' if extraction.get('roads_head') else 'no'} roads head, "
                       f"{'an' if extraction.get('department_email') else 'no'} email, "
                       f"{count(len(extraction.get('department_phones') or []), 'phone')}", model=model_id)
    else:
        extraction, model_id, prompt = {"road_lines": [], "road_totals": [], "roads_head": None,
                                        "department_email": None, "department_phones": [], "sign_work": []}, None, ""
        log("extract", "nothing readable, so the model was not called")

    chk = Checker(sources)
    fields = {"road_length_km": chk.road_length(extraction, dataset),
              "roads_head": chk.roads_head(extraction.get("roads_head")),
              "email": chk.email(extraction.get("department_email")),
              "phone": chk.phones(extraction.get("department_phones"))}
    sign_work = chk.sign_work(extraction.get("sign_work"))
    fields["key_documents"] = key_documents(sources, fields, sign_work)
    rejected = chk.rejected
    log("check", f"checks run: {count(len(rejected), 'value')} rejected", rejected=len(rejected))
    for r in rejected:
        log("reject", f"{r['field']}: {r['value']} ({r['reason']})", url=r.get("url"))

    road = fields["road_length_km"]
    questions = [road["question"]] if road["status"] == "needs_human" else []
    for q in questions:
        log("question", q["text"])
    if fields["phone"]["status"] == "needs_human":
        log("note", f"phone: {len(fields['phone']['values'])} different numbers printed for the department, "
                    f"left for a person")

    head = fields["roads_head"]
    proposal = None
    if head["status"] == "filled":
        same_page_phone = fields["phone"].get("value") if fields["phone"].get("cite", {}).get("source") == \
            head["cite"]["source"] else None
        found = {"name": head["name"], "title": head.get("title"), "phone": same_page_phone,
                 "email": fields["email"].get("value") if fields["email"].get("cite", {}).get("source") ==
                 head["cite"]["source"] else None}
        proposal = dedupe.propose(found, contacts)
        log("dedupe", f"merge proposed with {proposal['contact_id']} ({proposal['matched_on']})"
            if proposal["action"] == "merge" else "no matching Contact; a new Contact is proposed")

    if (readable or dataset) and not sign_work:
        # The brief says what the fields can't: what the town says about its signs. Without
        # that it would only repeat the contact fields, so there is none.
        brief = {"sentences": [], "model": None,
                 "skipped": f"None of the {count(len(readable), 'page')} read says anything about the "
                            f"{kind_of(account)}'s signs, so there's no brief. The fields above say who to reach."}
        log("brief", "no sign work on the pages read, so no brief")
    elif readable or dataset:
        try:
            brief = summarize.brief(account, fields, sign_work, context, sources, rejected)
            log("brief", f"{count(len(brief['sentences']), 'sentence')} kept", model=brief["model"])
        except RuntimeError as e:
            brief = {"sentences": [], "model": None, "error": str(e)}
            log("brief", f"brief failed: {e}")
    else:
        brief = {"sentences": [], "model": None}
    errors = f.errors + (nyf.errors if nyf else [])
    # Nothing read at all is a failed run, not a finished one with empty fields.
    status = "failed" if not (readable or dataset) else \
        "needs_review" if questions or fields["phone"]["status"] == "needs_human" else "done"
    run_at = now_iso()
    wb = writeback.build(account, fields, proposal, brief, questions, status, run_at, errors)
    log("writeback", f"{count(len(wb['requests']), 'request')} built, none sent")
    log("status", writeback.STATUS_LABEL[status])

    result = {
        "account": {**account, "example_public_account": True},
        "run": {"started_at": started, "finished_at": now_iso(), "model": model_id, "pages_read": len(readable),
                "page_fetches": f.used, "page_budget": f.budget,
                "http_requests": f.requests + (nyf.requests if nyf else 0), "prompt_chars": len(prompt)},
        "status": status,
        "steps": log.lines,
        "sources": [{"id": s.id, "url": s.url, "kind": s.kind, "title": s.title, "found_via": s.found_via,
                     "anchor": s.anchor or None, **s.record,
                     "pdf_pages_read": sorted(s.pdf_pages) or None, "pdf_page_count": s.notes.get("pdf_page_count"),
                     "hidden_emails": s.notes.get("hidden_emails") or None,
                     "dataset": s.notes if s.kind == "dataset" else None} for s in sources],
        "fetch_errors": errors,
        "extracted": extraction,
        "validated": fields,
        "sign_work": sign_work,
        "rejected": rejected,
        "proposed": field_rows(account, row, fields, proposal, brief, sources, rejected),
        "questions": questions,
        "merge": proposal if proposal and proposal["action"] == "merge" else None,
        "brief": brief,
        "writeback": wb,
    }
    # The text of every page the run took something from (or refused something from) is kept,
    # so each quote can be checked in place. Pages it read but took nothing from keep only
    # their hash: there's no reason to copy them.
    used = used_sources(result)
    pages = [{"id": s.id, "url": s.url, "kind": s.kind, "sha256": s.record["sha256"], "fetched_at": s.record["fetched_at"],
              "used": s.id in used, "chars": len(s.text) + sum(len(t) for t in s.pdf_pages.values()),
              "text": s.text if s.id in used and s.kind != "pdf" else None,
              "pdf_pages": ({str(k): v for k, v in s.pdf_pages.items()} or None) if s.id in used else None}
             for s in sources]
    (OUT / "pages").mkdir(parents=True, exist_ok=True)
    (OUT / f"{slug}.json").write_text(json.dumps(result, indent=1, ensure_ascii=False), encoding="utf-8", newline="\n")
    (OUT / "pages" / f"{slug}.json").write_text(json.dumps(pages, indent=1, ensure_ascii=False), encoding="utf-8", newline="\n")
    return result


def kind_of(account: dict) -> str:
    """'town', 'township' or 'county', from the Account's name."""
    first = account["name"].split()[0].lower()
    return first if first in ("town", "township") else "county" if account["name"].endswith("County") else "municipality"


def used_sources(result: dict) -> set[str]:
    """Source ids behind any proposed value, rejection, sign line, key document or brief sentence."""
    ids = {c["source"] for row in result["proposed"] for c in row.get("sources", []) if c.get("source")}
    ids |= {c["source"] for row in result["proposed"] for p in row.get("partial", []) for c in p["sources"]}
    ids |= {r["source"] for r in result["rejected"] if r.get("source")}
    ids |= {s["source"] for s in result["sign_work"]}
    ids |= {d["source"] for d in result["validated"]["key_documents"]}
    ids |= {c for s in result["brief"].get("sentences", []) for c in s["cites"]}
    return ids


def git(*args: str) -> str:
    try:
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    except OSError:
        return ""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("slugs", nargs="*")
    ap.add_argument("--cached", action="store_true", help="reuse pages in the local fetch cache (dev only)")
    ap.add_argument("--jobs", type=int, default=3)
    args = ap.parse_args()
    seed = load_seed()
    rows = [r for r in seed["accounts"] if not args.slugs or r["slug"] in args.slugs]
    OUT.mkdir(parents=True, exist_ok=True)
    clock = HostClock()
    started = now_iso()
    # Recorded before anything runs, so the run is tied to the code that made it.
    commit = git("rev-parse", "HEAD")
    dirty = bool(git("status", "--porcelain", "--", "pipeline"))

    ctx_log = RunLog("context")
    ctx_fetcher = Fetcher(CONTEXT, ctx_log, clock, budget=10, cache_dir=CACHE, cached=args.cached)
    context = summarize.load_context(ctx_fetcher)
    (OUT / "context.json").write_text(json.dumps({
        "steps": ctx_log.lines,
        "sources": [{"id": c.id, "url": c.url, "title": c.title, **c.record, "notes": c.notes or None,
                     "text": c.text} for c in context]},
        indent=1, ensure_ascii=False), encoding="utf-8", newline="\n")

    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        results = list(pool.map(lambda r: enrich(r, seed, clock, context, args.cached), rows))

    models = sorted({m for r in results for m in (r["run"]["model"], r["brief"].get("model")) if m})
    meta_path = OUT / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    meta.update({
        "run_date": started[:10], "started_at": started, "finished_at": now_iso(),
        "used_fetch_cache": args.cached,
        "model": models[0] if len(models) == 1 else models,
        "pipeline_commit": commit,
        "pipeline_dirty": dirty,
        "answer_key_commit": git("log", "--diff-filter=A", "--format=%H", "--", "data/answer_key.json"),
        "user_agent": USER_AGENT, "page_budget": PAGE_BUDGET, "min_delay_s": MIN_DELAY_S,
        "accounts": [{"slug": r["account"]["slug"], "status": r["status"], "pages_read": r["run"]["pages_read"],
                      "rejected": len(r["rejected"])} for r in results],
    })
    meta_path.write_text(json.dumps(meta, indent=1), encoding="utf-8", newline="\n")
    print(json.dumps(meta["accounts"], indent=1))


if __name__ == "__main__":
    sys.exit(main())
