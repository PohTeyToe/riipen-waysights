"""Polite fetcher: approved sites only, robots.txt obeyed, 2 s between requests
to the same host, a page budget per Account (robots.txt and redirect hops are
counted separately), TLS always verified.

Every request becomes a log line, so the run can be replayed as it happened.
"""
from __future__ import annotations

import hashlib
import json
import ssl
import threading
import time
import urllib.robotparser
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import requests
import truststore
from requests.adapters import HTTPAdapter

from .allowlist import host_allowed, is_allowed

USER_AGENT = "enrich-account-demo/0.1 (+https://github.com/PohTeyToe/riipen-waysights)"
MIN_DELAY_S = 2.0
PAGE_BUDGET = 15
MAX_BYTES = 30_000_000
TIMEOUT_S = 40


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class RunLog:
    """Append-only JSONL log for one Account. The page replays these lines."""

    def __init__(self, account: str):
        self.account = account
        self.lines: list[dict] = []

    def __call__(self, step: str, msg: str, **fields) -> dict:
        line = {"t": now_iso(), "step": step, "msg": msg, **{k: v for k, v in fields.items() if v is not None}}
        self.lines.append(line)
        print(f"[{self.account}] {step}: {msg}", flush=True)
        return line


class HostClock:
    """Shared across Accounts so two Accounts never hit one host back to back."""

    def __init__(self):
        self._lock = threading.Lock()
        self._last: dict[str, float] = {}

    def wait(self, host: str, delay: float) -> int:
        with self._lock:
            last = self._last.get(host)
            now = time.monotonic()
            wait_s = 0.0 if last is None else max(0.0, last + delay - now)
            self._last[host] = now + wait_s
        if wait_s:
            time.sleep(wait_s)
        return int(wait_s * 1000)


@dataclass
class Page:
    url: str
    requested_url: str
    status: int
    content_type: str
    size: int
    sha256: str
    fetched_at: str
    elapsed_ms: int
    body: bytes = field(repr=False, default=b"")

    @property
    def kind(self) -> str:
        ct = self.content_type.lower()
        path = urlsplit(self.url).path.lower()
        if "pdf" in ct or path.endswith(".pdf"):
            return "pdf"
        if "msword" in ct or path.endswith(".doc"):
            return "doc"
        if "json" in ct:
            return "json"
        if "xml" in ct and "html" not in ct:
            return "xml"
        return "html"

    def record(self) -> dict:
        return {
            "url": self.url,
            "requested_url": self.requested_url if self.requested_url != self.url else None,
            "status": self.status,
            "content_type": self.content_type,
            "bytes": self.size,
            "sha256": self.sha256,
            "fetched_at": self.fetched_at,
            "elapsed_ms": self.elapsed_ms,
        }


class OSTrustAdapter(HTTPAdapter):
    """Verify TLS with the operating system's trust store, like a browser.
    Some town sites send an incomplete certificate chain; the OS completes it
    from the certificate's own issuer link, and still rejects expired,
    self-signed or mismatched certificates. Verification is never turned off."""

    def init_poolmanager(self, *args, **kwargs):
        kwargs["ssl_context"] = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        return super().init_poolmanager(*args, **kwargs)


class Refused(Exception):
    """The fetcher declined or the site refused. The message says which and why."""


class Fetcher:
    def __init__(self, approved: list[str], log: RunLog, clock: HostClock, *, budget: int = PAGE_BUDGET,
                 cache_dir: Path | None = None, cached: bool = False, session: requests.Session | None = None):
        self.approved = approved
        self.log = log
        self.clock = clock
        self.budget = budget
        self.used = 0       # page fetches, counted against the budget
        self.requests = 0   # every HTTP request, robots.txt and redirect hops included
        self.cache_dir = cache_dir
        self.cached = cached  # dev only: reuse cached bytes instead of refetching
        self.session = session or requests.Session()
        self.session.mount("https://", OSTrustAdapter())
        self.session.headers["User-Agent"] = USER_AGENT
        self.robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}
        self.robots_refused: dict[str, str] = {}  # origin -> why its robots.txt shut the site out
        self.crawl_delay: dict[str, float] = {}
        self.pages: list[Page] = []
        self.errors: list[dict] = []

    # robots.txt -------------------------------------------------------------
    def _robots_for(self, url: str) -> urllib.robotparser.RobotFileParser | None:
        parts = urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        if origin in self.robots:
            return self.robots[origin]
        robots_url = origin + "/robots.txt"
        try:
            page = self._get(robots_url)
            # A redirected robots.txt is read where it lands (RFC 9309: follow up to five hops),
            # so the rules come from the file, never from the redirect response itself.
            for _ in range(5):
                location = getattr(page, "location", None)
                if not location:
                    break
                self.log("redirect", f"HTTP {page.status} redirect", url=page.url, to=location, status=page.status)
                if not host_allowed(location, self.approved):
                    raise Refused("robots.txt redirects off the approved list")
                page = self._get(location)
            if getattr(page, "location", None):
                raise Refused("robots.txt redirects more than five times")
        except Refused as e:
            self.log("robots", f"robots.txt unreadable, so nothing on {parts.netloc} is fetched", url=robots_url, reason=str(e))
            self.robots_refused[origin] = f"robots.txt unreadable ({e}), so the site wasn't read"
            self.robots[origin] = None
            return None
        rp = urllib.robotparser.RobotFileParser()
        if page.status == 404:
            rp.parse([])  # no robots.txt: everything allowed
        elif page.status >= 400:
            # 401/403/5xx: the site isn't letting scripts in. Treat as "don't crawl".
            self.log("robots", f"robots.txt answered HTTP {page.status}, so nothing on {parts.netloc} is fetched",
                     url=robots_url, status=page.status)
            self.robots_refused[origin] = f"robots.txt answered HTTP {page.status}, so the site wasn't read"
            self.robots[origin] = None
            return None
        else:
            lines = page.body.decode("utf-8", "replace").splitlines()
            rp.parse(lines)
        delay = rp.crawl_delay(USER_AGENT) or 0
        self.crawl_delay[parts.netloc] = max(MIN_DELAY_S, float(delay))
        self.robots[origin] = rp
        self.log("robots", f"robots.txt read for {parts.netloc}", url=robots_url, status=page.status,
                 delay_s=self.crawl_delay[parts.netloc])
        return rp

    def robots_allows(self, url: str) -> bool:
        rp = self._robots_for(url)
        return rp is not None and rp.can_fetch(USER_AGENT, url)

    # fetching ---------------------------------------------------------------
    def _cache_paths(self, url: str) -> tuple[Path, Path] | None:
        if not self.cache_dir:
            return None
        key = hashlib.sha1(url.encode()).hexdigest()
        return self.cache_dir / f"{key}.bin", self.cache_dir / f"{key}.json"

    def _get(self, url: str) -> Page:
        """One HTTP GET. Redirects are returned, not followed, so each hop can be checked."""
        host = urlsplit(url).netloc
        cache = self._cache_paths(url)
        self.requests += 1
        if self.cached and cache and cache[1].exists():
            meta = json.loads(cache[1].read_text())
            body = cache[0].read_bytes()
            page = Page(url=url, requested_url=url, status=meta["status"], content_type=meta["content_type"],
                        size=len(body), sha256=hashlib.sha256(body).hexdigest(), fetched_at=meta["fetched_at"],
                        elapsed_ms=meta["elapsed_ms"], body=body)
            if "location" in meta:
                page.location = urljoin(url, meta["location"])  # type: ignore[attr-defined]
            return page
        waited = self.clock.wait(host, self.crawl_delay.get(host, MIN_DELAY_S))
        started = time.monotonic()
        try:
            r = self.session.get(url, timeout=TIMEOUT_S, allow_redirects=False, stream=True)
            chunks, size = [], 0
            for chunk in r.iter_content(65536):
                chunks.append(chunk)
                size += len(chunk)
                if size > MAX_BYTES:
                    r.close()
                    raise Refused(f"larger than {MAX_BYTES // 1_000_000} MB")
            body = b"".join(chunks)
        except requests.exceptions.SSLError as e:
            raise Refused(f"TLS verification failed ({e.__class__.__name__})") from e
        except requests.RequestException as e:
            raise Refused(f"network error ({e.__class__.__name__})") from e
        elapsed = int((time.monotonic() - started) * 1000)
        page = Page(url=url, requested_url=url, status=r.status_code, content_type=r.headers.get("Content-Type", ""),
                    size=len(body), sha256=hashlib.sha256(body).hexdigest(), fetched_at=now_iso(),
                    elapsed_ms=elapsed, body=body)
        page.waited_ms = waited  # type: ignore[attr-defined]
        location = r.headers.get("Location") if r.is_redirect else None
        if location:
            page.location = urljoin(url, location)  # type: ignore[attr-defined]
        if cache:
            cache[0].parent.mkdir(parents=True, exist_ok=True)
            cache[0].write_bytes(body)
            meta = {"status": page.status, "content_type": page.content_type, "fetched_at": page.fetched_at,
                    "elapsed_ms": elapsed, **({"location": location} if location else {})}
            cache[1].write_text(json.dumps(meta))
        return page

    def fetch(self, url: str, why: str = "") -> Page:
        """Fetch an approved, robots-allowed URL, following up to 5 redirects
        that stay on the approved list. Raises Refused otherwise."""
        if not is_allowed(url, self.approved):
            self.log("skip", "off the approved list, not fetched", url=url)
            raise Refused("off the approved list")
        if self.used >= self.budget:
            self.log("skip", f"page budget of {self.budget} reached", url=url)
            raise Refused("page budget reached")
        if not self.robots_allows(url):
            parts = urlsplit(url)
            reason = self.robots_refused.get(f"{parts.scheme}://{parts.netloc}", "robots.txt disallows this path")
            self.log("skip", reason, url=url)
            self.errors.append({"url": url, "reason": reason})
            raise Refused(reason)
        self.used += 1
        current = url
        for _ in range(6):
            try:
                page = self._get(current)
            except Refused as e:
                self.log("error", f"fetch failed: {e}", url=current, why=why or None)
                self.errors.append({"url": current, "reason": str(e)})
                raise
            location = getattr(page, "location", None)
            if location:
                self.log("redirect", f"HTTP {page.status} redirect", url=current, to=location, status=page.status)
                if not is_allowed(location, self.approved) or not self.robots_allows(location):
                    self.log("skip", "redirect leaves the approved list or robots.txt disallows it", url=location)
                    self.errors.append({"url": current, "reason": f"redirects to {location}, off the approved list or disallowed"})
                    raise Refused("redirect leaves the approved list")
                current = location
                continue
            page.requested_url = url
            page.url = current
            self.log("fetch", f"HTTP {page.status}", url=current, status=page.status, bytes=page.size,
                     ms=page.elapsed_ms, waited_ms=getattr(page, "waited_ms", None), why=why or None,
                     page=f"{self.used}/{self.budget}")
            if page.status >= 400:
                self.errors.append({"url": current, "reason": f"HTTP {page.status}"})
                self.pages.append(page)
                raise Refused(f"HTTP {page.status}")
            self.pages.append(page)
            return page
        raise Refused("too many redirects")

