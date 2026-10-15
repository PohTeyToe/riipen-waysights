"""Match a person the run found to Contacts already on the Account.

A match needs the surname plus one more thing: the same phone, or the same
first initial. A surname alone is never enough. A match becomes a merge
proposal (keep the record id, update name and title, store the source);
nothing is merged automatically.
"""
from __future__ import annotations

import re

POST_NOMINALS = {"pe", "p.e", "p.eng", "peng", "jr", "sr", "ii", "iii", "phd", "mba", "cpa"}


def split_name(full: str) -> tuple[str, str]:
    """('Kevin J. Hajos, P.E.') -> ('kevin', 'hajos'). ('K. Hajos') -> ('k', 'hajos')."""
    words = [w.strip(".,").lower() for w in re.split(r"[\s,]+", full or "") if w.strip(".,")]
    words = [w for w in words if w.replace(".", "") not in {p.replace(".", "") for p in POST_NOMINALS}]
    words = [w for w in words if not re.fullmatch(r"\(.*\)", w)]
    if not words:
        return "", ""
    return (words[0] if len(words) > 1 else ""), words[-1]


def digits(s: str | None) -> str:
    return re.sub(r"\D", "", s or "")[-10:]


def match(found: dict, contact: dict) -> str | None:
    """Why `found` is the same person as `contact`, or None."""
    f_first, f_last = split_name(found.get("name", ""))
    c_first, c_last = split_name(contact.get("name", ""))
    if not f_last or f_last != c_last:
        return None
    if found.get("phone") and digits(found["phone"]) == digits(contact.get("phone")):
        return "same surname and phone"
    if f_first and c_first and f_first[0] == c_first[0]:
        return "same surname and first initial"
    return None


def propose(found: dict, contacts: list[dict]) -> dict:
    """One proposal for the roads head: merge into an existing Contact, or create one."""
    for c in contacts:
        why = match(found, c)
        if why:
            changes = {k: {"from": c.get(k), "to": found.get(k)} for k in ("name", "title", "phone", "email")
                       if found.get(k) and found.get(k) != c.get(k)}
            return {"action": "merge", "contact_id": c["id"], "matched_on": why, "existing": c, "changes": changes}
    return {"action": "create", "contact": found}
