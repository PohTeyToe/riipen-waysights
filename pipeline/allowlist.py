"""Approved sites. The crawler never fetches anything outside these.

Each entry is a host, optionally with a path prefix. A host entry also covers
its www. form. A path entry ("host/prefix/") covers only that folder, which is
how a town's own document folder on a shared file host gets approved without
approving the whole host.

Which sites count as approved is Waysights' call (question 2 in the plan).
This list is the demo's answer: each municipality's own site, the folder its
site links its PDFs from, and the New York State open data portal.
"""
from urllib.parse import unquote, urlsplit

APPROVED = {
    "lincoln": ["lincoln.ca"],
    # Pelham and West Lincoln publish their PDFs from their CMS vendor's file
    # host, each under its own folder. Only that folder is approved.
    "pelham": ["pelham.ca", "media-001-ca.cdn.govstack.com/pelham-007-ca/"],
    "west-lincoln": ["westlincoln.ca", "media-003-ca.cdn.govstack.com/westlincoln-002-ca/"],
    "saratoga": ["saratogacountyny.gov", "data.ny.gov"],
    "warren": ["warrencountyny.gov", "data.ny.gov"],
    "tompkins": ["tompkinscountyny.gov", "data.ny.gov"],
}


def _host(h: str) -> str:
    h = h.lower()
    return h[4:] if h.startswith("www.") else h


def matches(url: str, entry: str) -> bool:
    parts = urlsplit(url)
    if parts.scheme != "https":
        return False
    host, _, prefix = entry.partition("/")
    if _host(parts.hostname or "") != _host(host):
        return False
    # "/folder/../other/" is resolved by the HTTP client before it is sent, so the request
    # would leave the approved folder while the log kept the original URL. Refuse it.
    if any(seg in (".", "..") for seg in unquote(parts.path).split("/")):
        return False
    return parts.path.startswith("/" + prefix) if prefix else True


def is_allowed(url: str, entries: list[str]) -> bool:
    return any(matches(url, e) for e in entries)


def host_allowed(url: str, entries: list[str]) -> bool:
    """The host alone is on the list (robots.txt lives at a host's root, outside any approved folder)."""
    parts = urlsplit(url)
    return parts.scheme == "https" and any(_host(parts.hostname or "") == _host(e.partition("/")[0]) for e in entries)
