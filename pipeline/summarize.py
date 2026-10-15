"""The four-sentence Account brief.

The model writes from validated fields and quoted lines only. Then the same
rule as validate.py applies to each sentence: it must cite a source this run
read, and every number in it must be a validated value (or come from the rule
it cites). Sentences that fail are dropped and listed as rejected.
"""
from __future__ import annotations

from dataclasses import dataclass

from .discover import Source
from .extract import complete_json, PROMPTS
from .fetch import Fetcher, Refused
from .pages import doc_text, html_page, pdf_pages
from .validate import norm, numbers_in

# Waysights' own public pages: vocabulary only.
COMPANY_PAGES = [
    "https://waysights.com/faq/",
    "https://waysights.com/how-it-works/",
    "https://waysights.com/products/",
    "https://waysights.com/pricing/",
]


@dataclass
class Rule:
    jurisdiction: str
    label: str
    url: str
    quote: str


RULES = [
    Rule("ON", "O. Reg. 239/02, s. 12(1)", "https://www.ontario.ca/laws/docs/020239_e.doc",
         "The standard for the frequency of inspecting regulatory signs or warning signs to check to see that they "
         "meet the retro-reflectivity requirements of the Ontario Traffic Manual is once per calendar year, with each "
         "inspection taking place not more than 16 months from the previous inspection."),
    Rule("NY", "Federal MUTCD, 11th Edition, Section 2A.22, paragraph 02",
         "https://mutcd.fhwa.dot.gov/pdfs/11th_Edition/Chapter2a.pdf",
         "Public agencies or officials having jurisdiction shall use an assessment or management method that is "
         "designed to maintain sign retroreflectivity at or above the minimum levels in Table 2A-5."),
]

BRIEF_SCHEMA = {
    "type": "object",
    "properties": {"sentences": {"type": "array", "items": {"type": "object", "properties": {
        "text": {"type": "string"}, "cites": {"type": "array", "items": {"type": "string"}}},
        "required": ["text", "cites"]}}},
    "required": ["sentences"],
}


def load_context(f: Fetcher) -> list[Source]:
    """Read once per run. A rule is kept only if its quote is really in the fetched file."""
    out: list[Source] = []
    for url in COMPANY_PAGES:
        try:
            page = f.fetch(url, why="Waysights' own page, for the brief's vocabulary")
        except Refused:
            continue
        title, text, _, _ = html_page(page.body, page.url)
        out.append(Source(f"W{len(out) + 1}", page.url, "html", title, "company context", page.record(), text=text))
    for rule in RULES:
        try:
            page = f.fetch(rule.url, why=f"{rule.label}, for the brief")
        except Refused:
            continue
        if page.kind == "pdf":
            texts = pdf_pages(page.body)
            hit = next((i + 1 for i, t in enumerate(texts) if norm(rule.quote) in norm(t)), None)
            text = texts[hit - 1] if hit else ""
        else:
            hit, text = None, doc_text(page.body)
        if norm(rule.quote) not in norm(text):
            f.log("check", f"{rule.label}: quote not found in the fetched file, rule not used", url=page.url)
            continue
        f.log("check", f"{rule.label}: quote found in the fetched file", url=page.url, pdf_page=hit)
        src = Source(f"R{rule.jurisdiction}", page.url, "pdf" if hit else "doc", rule.label, "rule", page.record(),
                     text=rule.quote)
        src.notes = {"jurisdiction": rule.jurisdiction, "label": rule.label, "pdf_page": hit}
        out.append(src)
    return out


def facts_for(fields: dict, sign_work: list[dict], rule: Source | None) -> tuple[str, list[str]]:
    """Plain-text facts for the prompt, and the numbers a sentence may use."""
    lines, allowed = [], []
    road = fields["road_length_km"]
    if road["status"] == "filled":
        lines.append(f"- Road network: {road['value_km']} centerline km. Status: settled.")
        allowed.append(str(road["value_km"]))
    elif road["status"] == "needs_human":
        lines.append(f"- Road network: not settled, a person has to confirm it. Question: {road['question']['text']}")
    else:
        lines.append("- Road network: no total road length found in the sources read.")
    for o in road.get("options", []) + road.get("partial", []):
        for p in o["parts"]:
            c = p["cite"]
            lines.append(f"  - [{c['source']}] \"{c['quote']}\" ({p['road_type']}, {o['km']} km in total"
                         f"{', centerline' if o['centerline'] else ', not marked centerline'})")
            allowed += [str(o["km"]), p["value"]]
    if road.get("within_km"):
        lines.append(f"  - All roads inside the county, any owner: {road['within_km']} km ({road['data_year']}). "
                     f"Not used as the value.")
        allowed += [str(road["within_km"]), str(road["data_year"])]
    head = fields["roads_head"]
    if head.get("cite"):
        who = ", ".join(x for x in (head.get("name"), head.get("title")) if x)
        lines.append(f"- Roads head: {who} [{head['cite']['source']}]")
    for key, label in (("email", "Public Works email"), ("phone", "Public Works phone")):
        if fields[key].get("status") == "filled":
            lines.append(f"- {label}: {fields[key]['value']} [{fields[key]['cite']['source']}]")
            allowed.append(fields[key]["value"])
    for d in fields["key_documents"]:
        lines.append(f"- Key document: {d['title']} [{d['source']}]")
        allowed.append(d["title"])
    for s in sign_work:
        lines.append(f"- Sign work: \"{s['quote']}\" [{s['source']}]")
    if rule:
        lines.append(f"- Rule ({rule.notes['label']}): \"{rule.text}\" [{rule.id}]")
        allowed += [rule.notes["label"], rule.text]
    return "\n".join(lines), allowed


def brief(account: dict, fields: dict, sign_work: list[dict], context: list[Source], run_ids: set[str],
          rejected: list[dict]) -> dict:
    rule = next((c for c in context if c.notes.get("jurisdiction") == account["jurisdiction"]), None)
    facts, allowed = facts_for(fields, sign_work, rule)
    company = [c for c in context if c.id.startswith("W")]
    ctx = "\n\n".join(f"[{c.id}] {c.url}\n{c.text[:6000]}" for c in company)
    allowed_numbers = {n for a in allowed for n in numbers_in(a)}
    numbers = ", ".join(sorted({f"{n:g}" for n in allowed_numbers}, key=float)) or "none"
    prompt = (PROMPTS / "summarize.md").read_text(encoding="utf-8") \
        .replace("{account_name}", account["name"]).replace("{region}", account["region"]) \
        .replace("{facts}", facts).replace("{numbers}", numbers).replace("{context}", ctx)
    out, model_id = complete_json("You write short, sourced CRM notes. Every sentence cites its sources.",
                                  prompt, BRIEF_SCHEMA)
    known = run_ids | {c.id for c in context}
    url_of = {c.id: c.url for c in context}
    kept = []
    for s in out.get("sentences", []):
        text, cites = s.get("text", ""), s.get("cites") or []
        bad_cites = [c for c in cites if c not in known]
        stray = [n for n in numbers_in(text) if n not in allowed_numbers]
        reason = ("cites no source this run read" if not cites or bad_cites else
                  f"has a number that isn't a checked value: {', '.join(f'{n:g}' for n in stray)}" if stray else None)
        if reason:
            rejected.append({"field": "brief", "value": text, "reason": reason, "quote": "", "cites": cites})
            continue
        kept.append({"text": text, "cites": cites})
    return {"sentences": kept, "model": model_id, "url_of_context": {c: url_of[c] for s in kept for c in s["cites"]
                                                                       if c in url_of}}
