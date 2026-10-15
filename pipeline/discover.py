"""Find an Account's roads pages, contacts and (in Ontario) its asset
management plan by following the site's own links, the way a person would.

No document URL is hard-coded. Links are scored on their words; the best
unvisited link is read next until the page budget runs out. The sitemap is
read only when the menu runs out of good links.
"""
from __future__ import annotations

import heapq
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from urllib.parse import unquote, urlsplit

from .allowlist import is_allowed
from .fetch import Fetcher, Refused
from .pages import Link, clean_url, html_page, pdf_pages, pdf_title, pick_pdf_pages

# Words that make a link worth reading. Anchor text counts in full, the URL path at half weight
# (third item: whether the path counts). A bare "Contact" link is the site's own contact page;
# "Sheriff Contact" is another department's. The plans-and-reports pattern finds that section
# from its own link, not every page whose path sits under it.
WANT = [
    (r"asset management plan", 10, True),
    (r"public works|\bdpw\b", 8, True),
    (r"\bhighway department\b|\bhighway division\b", 8, True),
    (r"\bhighways?\b", 5, True),
    (r"\broads?\b", 5, True),
    (r"\binfrastructure\b", 4, True),
    (r"\btransportation\b", 3, True),
    (r"\b(contacts?|staff) directory\b|\bdirectory of officials\b", 6, True),
    (r"\bdepartments\b", 4, True),
    (r"^contacts?( us)?$", 3, True),
    (r"\bplans?\b.*\b(reports?|studies)\b|\b(reports?|studies)\b.*\bplans?\b", 6, False),
]
# Pages that are about one event or transaction, not the department or its plan.
AVOID = r"\bnews\b|\bposts?\b|\bevents?\b|\bcareers?\b|\bjobs?\b|\btenders?\b|\bbids?\b|\bagendas?\b|\bminutes\b|" \
        r"\bclosures?\b|\bpermits?\b|\bpolic(y|ies)\b|natural asset|\bforms?\b|\blogin\b|\bsearch\b|\bsubscribe\b|" \
        r"\bprojects?\b|\bconstruction\b"
MIN_SCORE = 3
MAX_DEPTH = 3
PLAN = re.compile(r"asset management plan", re.I)
YEAR = re.compile(r"\b(20\d\d)\b")


def words(s: str) -> str:
    return re.sub(r"[-_/+]+", " ", unquote(s)).lower()


def score_link(text: str, url: str, avoid: bool = True) -> float:
    path = words(urlsplit(url).path).strip()
    anchor = words(text).strip()
    if avoid and (re.search(AVOID, anchor) or re.search(AVOID, path)):
        return -1
    s = 0.0
    for pattern, weight, in_path in WANT:
        if re.search(pattern, anchor):
            s += weight
        if in_path and re.search(pattern, path):
            s += weight / 2
    if is_pdf(url) or "pdf" in anchor:
        # Only plans are worth a PDF download. Newest year wins among plans.
        if not (PLAN.search(anchor) or PLAN.search(path)):
            return -1
        years = [int(y) for y in YEAR.findall(anchor + " " + path)]
        s += 0.1 * (max(years) - 2000) if years else 0
    return s


def is_pdf(url: str) -> bool:
    return urlsplit(url).path.lower().endswith(".pdf")


@dataclass
class Source:
    id: str
    url: str
    kind: str            # html | pdf | dataset
    title: str
    found_via: str       # how discovery got here, for the log
    record: dict
    text: str = ""       # html: page text; pdf: selected pages joined
    pdf_pages: dict[int, str] = field(default_factory=dict)  # page number -> text (pdf only)
    notes: dict = field(default_factory=dict)
    anchor: str = ""     # the link text that led here


@dataclass(order=True)
class Candidate:
    neg_score: float
    order: int
    url: str = field(compare=False)
    text: str = field(compare=False)
    depth: int = field(compare=False)
    via: str = field(compare=False)
    in_menu: bool = field(compare=False, default=False)


class Discovery:
    def __init__(self, fetcher: Fetcher, website: str, wants_plan: bool):
        self.f = fetcher
        self.log = fetcher.log
        self.website = website
        self.wants_plan = wants_plan
        self.sources: list[Source] = []
        self.frontier: list[Candidate] = []
        self.seen: set[str] = set()
        self.offlist_logged: set[str] = set()
        self.offlist_count = 0
        self.plan_read = False
        self.sitemap_read = False
        self._order = 0
        self.taken: set[str] = set()

    def _key(self, url: str) -> str:
        p = urlsplit(url)
        # Query strings on a municipal page are language switches, sorting or print views:
        # the same page. A development run spent the budget on those copies. A site that
        # routes pages by query string ("/?page=roads") would need this changed; none of
        # the six does. (The state dataset is queried directly, not discovered.)
        return p.netloc.lower().removeprefix("www.") + p.path.rstrip("/").lower()

    def push(self, url: str, text: str, depth: int, via: str, score: float | None = None,
             in_menu: bool = False) -> None:
        key = self._key(url)
        if key in self.seen:
            return
        s = score_link(text, url) if score is None else score
        if not is_allowed(url, self.f.approved):
            # Log the off-list links that looked relevant; count the rest.
            self.offlist_count += 1
            if score_link(text, url, avoid=False) >= MIN_SCORE and key not in self.offlist_logged:
                self.offlist_logged.add(key)
                self.log("skip", f"off-list link skipped: \"{text or url}\"", url=url)
            return
        if s < MIN_SCORE or depth > MAX_DEPTH:
            return
        self.seen.add(key)
        self._order += 1
        heapq.heappush(self.frontier, Candidate(-s, self._order, url, text, depth, via, in_menu))

    def add_links(self, links: list[Link], depth: int, via: str) -> None:
        for link in links:
            self.push(link.url, link.text, depth, via, in_menu=link.in_menu)

    def run(self) -> list[Source]:
        home = clean_url(self.website, self.website)
        self.seen.add(self._key(home))
        try:
            page = self.f.fetch(home, why="the Account's website")
        except Refused:
            return self.sources
        self._take(page, "the Account's website", depth=0)

        while True:
            # When the menu runs out of good links and the Account still lacks what it
            # needs (anything at all, or in Ontario the plan the town must publish
            # under O. Reg. 588/17 s.10), read the sitemap once.
            if not self.frontier and not self.sitemap_read and (len(self.sources) < 2 or
                                                                (self.wants_plan and not self.plan_read)):
                self.read_sitemap()
            if not self.frontier or self.f.used >= self.f.budget:
                break
            c = heapq.heappop(self.frontier)
            if is_pdf(c.url) and self.plan_read:
                continue  # one plan per Account: the newest one linked
            via = (f"{'menu ' if c.in_menu else ''}link \"{c.text}\" on {c.via}" if c.text
                   else f"listed in the {c.via}")
            try:
                page = self.f.fetch(c.url, why=via)
            except Refused:
                continue
            if self._key(page.url) != self._key(c.url) and self._key(page.url) in self.taken:
                self.log("skip", "redirected to a page already read", url=page.url)
                continue
            self._take(page, via, depth=c.depth, anchor=c.text)
        if self.offlist_count:
            self.log("skip", f"{self.offlist_count} links pointed off the approved list and were not followed")
        return self.sources

    def _take(self, page, via: str, depth: int, anchor: str = "") -> None:
        self.taken.add(self._key(page.url))
        self.seen.add(self._key(page.url))
        sid = f"S{len(self.sources) + 1}"
        if page.kind == "pdf":
            try:
                texts = pdf_pages(page.body)
            except Exception as e:  # third-party bytes: a broken or mislabelled PDF is skipped, not fatal
                self.log("pdf", f"PDF unreadable ({e.__class__.__name__}), skipped", url=page.url)
                return
            chosen = pick_pdf_pages(texts)
            src = Source(sid, page.url, "pdf", anchor or pdf_title(page.body) or page.url, via, page.record(),
                         pdf_pages={n: texts[n - 1] for n, _ in chosen}, anchor=anchor)
            src.notes["pdf_page_count"] = len(texts)
            self.log("pdf", f"PDF read: {len(texts)} pages", url=page.url, pages=len(texts))
            for n, score in chosen:
                self.log("pdf", f"PDF page {n} read (road-length lines: {score})", url=page.url, pdf_page=n)
            if not chosen:
                self.log("pdf", "no page in this PDF states a road length", url=page.url)
            self.plan_read = self.plan_read or bool(PLAN.search(words(via + " " + page.url)))
            self.sources.append(src)
            return
        if page.kind == "xml":
            return
        title, text, links, notes = html_page(page.body, page.url)
        src = Source(sid, page.url, "html", title, via, page.record(), text=text, notes=notes, anchor=anchor)
        if notes.get("hidden_emails"):
            self.log("note", f"{notes['hidden_emails']} email address(es) hidden from scripts by the site; not decoded",
                     url=page.url)
        self.sources.append(src)
        self.add_links(links, depth + 1, f"{title or page.url}")

    def read_sitemap(self) -> None:
        self.sitemap_read = True
        origin = "{0.scheme}://{0.netloc}".format(urlsplit(clean_url(self.website, self.website)))
        rp = self.f.robots.get(origin)
        urls = (rp.site_maps() if rp else None) or [origin + "/sitemap.xml"]
        self.log("discover", "menu has no route to what this Account needs; reading the sitemap", url=urls[0])
        todo = [clean_url(u, origin) for u in urls[:2]]
        read = 0
        while todo and read < 3:
            url = todo.pop(0)
            try:
                page = self.f.fetch(url, why="sitemap")
            except Refused:
                continue
            read += 1
            try:
                root = ET.fromstring(page.body)
            except ET.ParseError:
                continue
            ns = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
            for loc in root.iter(f"{ns}loc"):
                u = clean_url(loc.text or "", origin)
                if not u:
                    continue
                if root.tag.endswith("sitemapindex"):
                    todo.append(u)
                else:
                    # A sitemap has no link text, so only the URL path is scored (at half weight).
                    self.push(u, "", depth=1, via="sitemap")
