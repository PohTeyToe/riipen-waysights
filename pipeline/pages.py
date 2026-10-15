"""Turn fetched bytes into the text the extractor reads and the checks compare
against. What's saved here is exactly what the model saw.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit, urlunsplit

from bs4 import BeautifulSoup
from pypdf import PdfReader

DROP = ["script", "style", "noscript", "svg", "template", "iframe"]
BLOCK = ["p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "table", "section", "article",
         "aside", "header", "footer", "address", "dt", "dd", "dl", "blockquote", "main", "form", "label"]


@dataclass
class Link:
    url: str
    text: str
    in_menu: bool


def clean_url(href: str, base: str) -> str | None:
    if not href or href.startswith(("mailto:", "tel:", "javascript:", "#")):
        return None
    url = urljoin(base, href.strip())
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https"):
        return None
    # Never fetch plain http: upgrade, and if the site has no https the fetch fails and is logged.
    return urlunsplit(("https", parts.netloc.lower(), parts.path or "/", parts.query, ""))


def html_page(body: bytes, base_url: str) -> tuple[str, str, list[Link], dict]:
    """Returns (title, text, links, notes). Links come from the whole page,
    menus included, because the site menu is how a person finds the plan.
    The text drops menus so the model reads the page itself."""
    soup = BeautifulSoup(body, "html.parser")
    for t in soup(DROP):
        t.decompose()
    title = " ".join(soup.title.get_text(" ").split()) if soup.title else ""

    links: list[Link] = []
    for a in soup.find_all("a", href=True):
        url = clean_url(a["href"], base_url)
        if url:
            in_menu = a.find_parent(["nav"]) is not None or a.find_parent(attrs={"role": "navigation"}) is not None
            links.append(Link(url, " ".join(a.get_text(" ").split()), in_menu))

    notes = {"hidden_emails": 0}
    # Cloudflare email protection: the address is hidden from scripts on purpose. Not decoded.
    for a in soup.select("a.__cf_email__, span.__cf_email__, [data-cfemail]"):
        notes["hidden_emails"] += 1
        a.replace_with("[email hidden from scripts]")
    # A mailto or tel link publishes its address even when the link text is a word.
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        for scheme in ("mailto:", "tel:"):
            if href.lower().startswith(scheme):
                value = href[len(scheme):].split("?")[0].strip()
                if value and value.lower() not in a.get_text(" ").lower():
                    a.append(f" ({value})")

    for t in soup.find_all(["nav"]) + soup.find_all(attrs={"role": "navigation"}):
        t.decompose()
    for br in soup.find_all("br"):
        # html.parser sometimes nests the text after a <br /> inside it, so keep the children.
        br.insert_before("\n")
        br.unwrap()
    for t in soup.find_all(["td", "th"]):
        t.insert_after(" ")
    for t in soup.find_all(BLOCK):
        t.insert_before("\n")
        t.insert_after("\n")
    root = soup.body or soup
    lines = [" ".join(line.split()) for line in root.get_text("").split("\n")]
    text = "\n".join(line for line in lines if line)
    return title, text, links, notes


def pdf_pages(body: bytes) -> list[str]:
    """Page texts in reading order (pypdf extract_text). Plain-text tools that
    keep the visual layout scramble table rows; reading order keeps a row's
    label and number on one line."""
    reader = PdfReader(io.BytesIO(body))
    return [(p.extract_text() or "") for p in reader.pages]


def pdf_title(body: bytes) -> str:
    try:
        meta = PdfReader(io.BytesIO(body)).metadata
        return (meta.title or "").strip() if meta else ""
    except Exception:
        return ""


ROAD_WORD = re.compile(r"\b(roads?|roadway|highways?)\b", re.I)
UNIT_WORD = re.compile(r"\b(km|kms|kilomet\w*|meters|metres|miles?)\b", re.I)
NUMBER = re.compile(r"\b\d[\d,]*(\.\d+)?\b")
INVENTORY = re.compile(r"\b(quantity|inventory|length)\b", re.I)


def road_page_score(text: str) -> int:
    """How much a PDF page looks like it states road length: rows that name a
    road type, a length unit and a number. A table row can wrap onto the next
    line ("kms of collector" / "roads" / "55"), so each line is read together
    with the two after it."""
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    score = 0
    for i, line in enumerate(lines):
        if not UNIT_WORD.search(line):
            continue
        row = " ".join(lines[i:i + 3])
        if ROAD_WORD.search(row) and NUMBER.search(row):
            score += 3 if INVENTORY.search(row) else 1
    return score


def pick_pdf_pages(texts: list[str], k: int = 3) -> list[tuple[int, int]]:
    """Top k pages by road_page_score, as (1-based page number, score)."""
    scored = [(i + 1, road_page_score(t)) for i, t in enumerate(texts)]
    scored = [s for s in scored if s[1] > 0]
    scored.sort(key=lambda s: (-s[1], s[0]))
    return scored[:k]


DOC_RUN_8BIT = re.compile(rb"[\x20-\x7e\xa0-\xff\t\r\n]{12,}")
DOC_RUN_UTF16 = re.compile(rb"(?:[\x20-\x7e\xa0-\xff]\x00|[\t\r\n]\x00){12,}")


def doc_text(body: bytes) -> str:
    """Text runs from a legacy Word .doc, which stores text as 8-bit (cp1252)
    or UTF-16 runs. Good enough to check that a quoted sentence is in the
    file; not a full .doc reader."""
    runs = [m.group().decode("cp1252", "replace") for m in DOC_RUN_8BIT.finditer(body)]
    runs += [m.group().decode("utf-16-le", "replace") for m in DOC_RUN_UTF16.finditer(body)]
    return "\n".join(" ".join(r.split()) for r in runs)
