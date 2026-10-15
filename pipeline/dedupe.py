"""Match a person the run found to Contacts already on the Account.

A match needs the surname plus one more thing: the same phone, or the same
first initial where one side gives only an initial. A surname alone is never
enough, and two different full first names never match. A match becomes a merge
proposal (keep the record id, update name and title, store the source);
nothing is merged automatically.
"""
from __future__ import annotations

import re

from .validate import phone_line

POST_NOMINALS = {"pe", "p.e", "p.eng", "peng", "jr", "sr", "ii", "iii", "phd", "mba", "cpa"}


def name_parts(full: str) -> list[str]:
    """'Kevin J. Hajos, P.E.' -> ['Kevin', 'J.', 'Hajos']. Drops post-nominals and nicknames in brackets."""
    nominals = {p.replace(".", "") for p in POST_NOMINALS}
    words = [w.strip(",") for w in re.split(r"[\s,]+", full or "") if w.strip(",.")]
    return [w for w in words if w.lower().replace(".", "") not in nominals and not re.fullmatch(r"\(.*\)", w)]


def crm_name(full: str) -> tuple[str, str]:
    """First and last name for the CRM: ('Kevin J.', 'Hajos')."""
    words = name_parts(full)
    return " ".join(words[:-1]), (words[-1] if words else "")


def split_name(full: str) -> tuple[str, str]:
    """For matching: ('Kevin J. Hajos, P.E.') -> ('kevin', 'hajos'). ('K. Hajos') -> ('k', 'hajos')."""
    words = [w.strip(".").lower() for w in name_parts(full)]
    if not words:
        return "", ""
    return (words[0] if len(words) > 1 else ""), words[-1]


def match(found: dict, contact: dict) -> str | None:
    """Why `found` is the same person as `contact`, or None."""
    f_first, f_last = split_name(found.get("name", ""))
    c_first, c_last = split_name(contact.get("name", ""))
    if not f_last or f_last != c_last:
        return None
    if len(f_first) > 1 and len(c_first) > 1 and f_first != c_first:
        return None  # two full first names that differ are two people, even on a shared department line
    if found.get("phone") and contact.get("phone") and phone_line(found["phone"]) == phone_line(contact["phone"]):
        return "same surname and phone"
    if f_first and c_first and f_first[0] == c_first[0]:
        return "same surname and first name" if f_first == c_first else "same surname and first initial"
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
