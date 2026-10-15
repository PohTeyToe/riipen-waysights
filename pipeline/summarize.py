"""The Account brief: one or two sentences a rep reads before calling.

The record already shows the road length, the department's phone and email, the
roads head and the key documents, so the brief says what those fields can't:
what the municipality says about its own signs, and who to ask for. It never
repeats the road length or an open question, so answering a question can't
leave it out of date.

The model writes from checked fields and quoted lines only. Then each sentence
is checked the way validate.py checks a value: it must cite a page this run
read, every number in it must be a checked value or printed in a checked quote,
anything it puts in quotation marks must be printed on a page it cites, and it
must share something with every page it cites (a checked value, words it quotes,
or four words in a row). Sentences that fail are dropped and listed as rejected.
"""
from __future__ import annotations

import re

from .discover import Source
from .extract import complete_json, PROMPTS
from .fetch import Fetcher, Refused
from .pages import html_page
from .validate import digits, norm, numbers_in

# Waysights' own public pages: vocabulary only.
COMPANY_PAGES = [
    "https://waysights.com/faq/",
    "https://waysights.com/how-it-works/",
    "https://waysights.com/products/",
    "https://waysights.com/pricing/",
]

BRIEF_SCHEMA = {
    "type": "object",
    "properties": {"sentences": {"type": "array", "items": {"type": "object", "properties": {
        "text": {"type": "string"}, "cites": {"type": "array", "items": {"type": "string"}}},
        "required": ["text", "cites"]}}},
    "required": ["sentences"],
}


def load_context(f: Fetcher) -> list[Source]:
    """Waysights' pages, read once per run."""
    out: list[Source] = []
    for url in COMPANY_PAGES:
        try:
            page = f.fetch(url, why="Waysights' own page, for the brief's vocabulary")
        except Refused:
            continue
        title, text, _, _ = html_page(page.body, page.url)
        out.append(Source(f"W{len(out) + 1}", page.url, "html", title, "company context", page.record(), text=text))
    return out


def facts_for(fields: dict, sign_work: list[dict]) -> tuple[str, list[str], dict[str, list[str]]]:
    """Plain-text facts for the prompt, the strings whose numbers a sentence may use,
    and the checked values each source id backs."""
    lines, allowed = [], []
    values: dict[str, list[str]] = {}

    def back(cite: dict, *vals: str | None) -> None:
        values.setdefault(cite["source"], []).extend(v for v in vals if v)

    for s in sign_work:
        lines.append(f"- Sign work: \"{s['quote']}\" [{s['source']}]")
        allowed.append(s["quote"])
    if not sign_work:
        lines.append("- Sign work: nothing on the pages read.")
    head = fields["roads_head"]
    if head.get("cite"):
        who = ", ".join(x for x in (head.get("name"), head.get("title")) if x)
        lines.append(f"- Roads head: {who} [{head['cite']['source']}]")
        back(head["cite"], head.get("name"), head.get("title"))
    else:
        lines.append("- Roads head: not named on the pages read.")
    # The department's own words come with each value, so the brief names it the way its page does.
    email = fields["email"]
    if email.get("status") == "filled":
        lines.append(f"- The department's email: {email['value']}, printed as \"{email['cite']['quote']}\" "
                     f"[{email['cite']['source']}]")
        allowed.append(email["value"])
        back(email["cite"], email["value"])
    phone = fields["phone"]
    if phone.get("status") == "filled":
        lines.append(f"- The department's phone: {phone['value']}, printed as \"{phone['cite']['quote']}\" "
                     f"[{phone['cite']['source']}]")
        allowed.append(phone["value"])
        back(phone["cite"], phone["value"])
    elif phone.get("status") == "needs_human":
        printed = "; ".join(f"{v} [{c['source']}]" for v, c in zip(phone["values"], phone["cites"]))
        lines.append(f"- The department's phone: not settled. The pages print different numbers ({printed}); "
                     f"give neither.")
    for d in fields["key_documents"]:
        lines.append(f"- Key document: {d['title']} [{d['source']}]")
        allowed.append(d["title"])
        back(d, d["title"])
    return "\n".join(lines), allowed, values


def four_word_runs(text: str) -> set[tuple[str, ...]]:
    words = re.findall(r"[a-z0-9]+", norm(text))
    return {tuple(words[i:i + 4]) for i in range(len(words) - 3)}


def quoted(sentence: str) -> list[str]:
    """The words a sentence puts in quotation marks."""
    return [q.strip(" ,.;:") for q in re.findall(r'"([^"]+)"', norm(sentence)) if q.strip(" ,.;:")]


def backs(sentence: str, sid: str, texts: dict[str, str], values: dict[str, list[str]]) -> bool:
    """Does the cited page support the sentence: a checked value from that page, words the
    sentence quotes from it, or four words in a row?"""
    s, page = norm(sentence), norm(texts.get(sid, ""))
    for v in values.get(sid, []):
        if norm(v) in s or (len(digits(v)) >= 10 and digits(v) in digits(sentence)):
            return True
    if any(q in page for q in quoted(sentence)):
        return True
    return bool(four_word_runs(sentence) & four_word_runs(page))


def brief(account: dict, fields: dict, sign_work: list[dict], context: list[Source], sources: list[Source],
          rejected: list[dict]) -> dict:
    facts, allowed, values = facts_for(fields, sign_work)
    company = [c for c in context if c.id.startswith("W")]
    ctx = "\n\n".join(f"[{c.id}] {c.url}\n{c.text[:6000]}" for c in company)
    allowed_numbers = {n for a in allowed for n in numbers_in(a)}
    numbers = ", ".join(sorted({f"{n:g}" for n in allowed_numbers}, key=float)) or "none"
    prompt = (PROMPTS / "summarize.md").read_text(encoding="utf-8") \
        .replace("{account_name}", account["name"]).replace("{region}", account["region"]) \
        .replace("{facts}", facts).replace("{numbers}", numbers).replace("{context}", ctx)
    out, model_id = complete_json("You write short, sourced CRM notes. Every sentence cites its sources.",
                                  prompt, BRIEF_SCHEMA)
    texts = {s.id: s.text + "\n" + "\n".join(s.pdf_pages.values()) for s in [*sources, *company]}
    kept = []
    for s in out.get("sentences", []):
        text, cites = s.get("text", ""), s.get("cites") or []
        unknown = [c for c in cites if c not in texts]
        stray = [n for n in numbers_in(text) if n not in allowed_numbers]
        unbacked = [c for c in cites if c in texts and not backs(text, c, texts, values)]
        misquoted = [q for q in quoted(text) if not any(q in norm(texts.get(c, "")) for c in cites)]
        reason = ("cites no source this run read" if not cites or unknown else
                  f"has a number that isn't a checked value: {', '.join(f'{n:g}' for n in stray)}" if stray else
                  f"quotes words its pages don't print: \"{misquoted[0]}\"" if misquoted else
                  f"nothing in it comes from {', '.join(unbacked)}" if unbacked else None)
        if reason:
            rejected.append({"field": "brief", "value": text, "reason": reason, "quote": "", "cites": cites})
            continue
        kept.append({"text": text, "cites": cites})
    cited = {c for s in kept for c in s["cites"]}
    return {"sentences": kept, "model": model_id,
            "context": {c.id: {"url": c.url, "title": c.title} for c in company if c.id in cited}}
