"""Build the Zoho CRM requests the run would send. Nothing is sent.

Draft, never run in a Zoho org: the custom field API names below are guesses
until we see the real Account and Contact layouts.

Request shapes checked against Zoho CRM API v8 docs on 2026-10-15:
- Update: PUT {api-domain}/crm/v8/{module}, body {"data": [{"id": ..., ...}]}.
  https://www.zoho.com/crm/developer/docs/api/v8/update-records.html
- Insert: POST {api-domain}/crm/v8/{module}, body {"data": [...]}.
  https://www.zoho.com/crm/developer/docs/api/v8/insert-records.html
- Notes: POST {api-domain}/crm/v8/Notes, body {"data": [{"Parent_Id":
  {"module": {"api_name": ...}, "id": ...}, "Note_Content": ...}]}.
  https://www.zoho.com/crm/developer/docs/api/v8/create-notes.html
Auth header for all of them: "Authorization: Zoho-oauthtoken <token>".

The button sends the Account's record id, so the Account is updated by that id,
never matched by name.
"""
from __future__ import annotations

from .dedupe import crm_name

API = "https://www.zohoapis.com/crm/v8"
STATUS_LABEL = {"done": "Done", "needs_review": "Needs review", "failed": "Failed"}

# Guessed custom fields (standard fields: Last_Name, First_Name, Title, Account_Name on a Contact).
# The department's phone gets its own field so the town's main Phone is never overwritten.
F_ROAD_KM = "Road_Network_Centerline_km"
F_PW_EMAIL = "Public_Works_Email"
F_PW_PHONE = "Public_Works_Phone"
F_KEY_DOCS = "Key_Documents"
F_BRIEF = "Account_Brief"
F_STATUS = "Enrichment_Status"
F_LAST = "Last_Enriched"
F_SOURCE = "Enrichment_Source"


def _source_line(cite: dict) -> str:
    page = f", p. {cite['pdf_page']}" if cite.get("pdf_page") else ""
    return f"{cite['url']}{page} (fetched {cite['fetched_at'][:10]})"


def account_update(account: dict, fields: dict, brief: dict, status: str, run_at: str) -> dict:
    record = {"id": account["crm_id"], F_STATUS: STATUS_LABEL[status]}
    if status != "failed":
        record[F_LAST] = run_at  # a failed run doesn't count against the one-run-a-day rule
    if fields["road_length_km"]["status"] == "filled":
        record[F_ROAD_KM] = fields["road_length_km"]["value_km"]
    if fields["email"]["status"] == "filled":
        record[F_PW_EMAIL] = fields["email"]["value"]
    if fields["phone"]["status"] == "filled":
        record[F_PW_PHONE] = fields["phone"]["value"]
    if fields["key_documents"]:
        record[F_KEY_DOCS] = "\n".join(f"{d['title']}: {d['url']}" for d in fields["key_documents"])
    if brief.get("sentences"):
        record[F_BRIEF] = " ".join(s["text"] for s in brief["sentences"])
    return {"method": "PUT", "url": f"{API}/Accounts", "body": {"data": [record]}}


def contact_request(account: dict, proposal: dict | None, head: dict) -> dict | None:
    """The roads head as a Contact: name, title and where they came from. The phone and email
    the towns print belong to the department, so they go on the Account, not on a person.
    Zoho's default Contact key is Email, which department addresses can't serve, so the
    duplicate check is ours (dedupe.py): a match updates that record by id, no match creates one."""
    if not proposal:
        return None
    first, last = crm_name(head.get("name") or "")
    record = {"First_Name": first or None, "Last_Name": last, "Title": head.get("title"),
              F_SOURCE: _source_line(head["cite"])}
    if proposal["action"] == "merge":
        return {"method": "PUT", "url": f"{API}/Contacts",
                "body": {"data": [{"id": proposal["contact_id"], **record}]}}
    record["Account_Name"] = {"id": account["crm_id"]}
    return {"method": "POST", "url": f"{API}/Contacts", "body": {"data": [record]}}


def _note(account: dict, first_line: str, cites: list[dict], last_line: str) -> dict:
    lines = [first_line, ""] + [f"- \"{c['quote']}\" ({_source_line(c)})" for c in cites] + ["", last_line]
    return {"Parent_Id": {"module": {"api_name": "Accounts"}, "id": account["crm_id"]},
            "Note_Title": "Enrich Account: needs a person", "Note_Content": "\n".join(lines)}


def notes(account: dict, questions: list[dict], fields: dict, errors: list[dict]) -> list[dict]:
    """One Note per thing a person has to settle, with every quote, its source and fetch date.
    A Note's first line is its question, which is how an answer on the page finds it."""
    out = []
    road = fields["road_length_km"]
    for q in questions:
        cites = [p["cite"] for o in road.get("options", []) for p in o["parts"] + o.get("agrees", [])]
        out.append(_note(account, q["text"], cites, "Left blank by Enrich Account until someone confirms it."))
    phone = fields["phone"]
    if phone["status"] == "needs_human":
        out.append(_note(account, "The pages print different numbers for the department. Which one reaches it?",
                         phone["cites"], "Left blank by Enrich Account until someone confirms it."))
    if errors:
        lines = ["Enrich Account couldn't read the website, so nothing was filled.", ""]
        lines += [f"- {e['url']}: {e['reason']}" for e in errors]
        lines += ["", "Press Enrich Account again later, or check the website on the Account."]
        out.append({"Parent_Id": {"module": {"api_name": "Accounts"}, "id": account["crm_id"]},
                    "Note_Title": "Enrich Account: run failed", "Note_Content": "\n".join(lines)})
    if not out:
        return []
    return [{"method": "POST", "url": f"{API}/Notes", "body": {"data": out}}]


def build(account: dict, fields: dict, proposal: dict | None, brief: dict, questions: list[dict], status: str,
          run_at: str, errors: list[dict] | None = None) -> dict:
    failed = status == "failed"
    return {
        "sent": False,
        "note": "Preview only: nothing is sent. Draft, never run in a Zoho org; field names are guesses.",
        "requests": [r for r in [account_update(account, fields, brief, status, run_at),
                                 None if failed else contact_request(account, proposal, fields["roads_head"])] if r]
                    + notes(account, questions, fields, (errors or []) if failed else []),
    }
