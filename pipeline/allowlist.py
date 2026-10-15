"""Approved sites. The crawler never fetches anything outside these.

Each entry is a host, optionally with a path prefix. A host entry also covers
its www. form. A path entry ("host/prefix/") covers only that folder, which is
how a town's own document folder on a shared file host gets approved without
approving the whole host.

Which sites count as approved is Waysights' call (question 2 in the plan).
This list is the demo's answer: each municipality's own site, the folder its
site links its PDFs from, and the New York State open data portal.
"""
from urllib.parse import urlsplit

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

# Read once per run for the Account brief: Waysights' own public pages and the
# two sign rules the brief cites. Never used as a source for an Account field.
CONTEXT = [
    "waysights.com",
    "www.ontario.ca/laws/",
    "mutcd.fhwa.dot.gov/pdfs/",
]


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
    return parts.path.startswith("/" + prefix) if prefix else True


def is_allowed(url: str, entries: list[str]) -> bool:
    return any(matches(url, e) for e in entries)
