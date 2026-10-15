"""Build the Zoho CRM requests the run would send. Nothing is sent.

Draft, never run in a Zoho org: the custom field API names below are guesses
until we see the real Account and Contact layouts.

Request shapes checked against Zoho CRM API v8 docs on 2026-10-15:
- Upsert: POST {api-domain}/crm/v8/{module}/upsert, body {"data": [...],
  "duplicate_check_fields": [...], "trigger": [...]}. Default duplicate check
  fields are Account_Name for Accounts and Email for Contacts.
  https://www.zoho.com/crm/developer/docs/api/v8/upsert-records.html
- Update: PUT {api-domain}/crm/v8/{module}, body {"data": [{"id": ..., ...}]}.
  https://www.zoho.com/crm/developer/docs/api/v8/update-records.html
- Notes: POST {api-domain}/crm/v8/Notes, body {"data": [{"Parent_Id":
  {"module": {"api_name": ...}, "id": ...}, "Note_Content": ...}]}.
  https://www.zoho.com/crm/developer/docs/api/v8/create-notes.html
Auth header for all of them: "Authorization: Zoho-oauthtoken <token>".
"""
from __future__ import annotations

from .dedupe import crm_name

API = "https://www.zohoapis.com/crm/v8"
STATUS_LABEL = {"done": "Done", "needs_review": "Needs review"}

# Guessed custom fields (standard fields: Account_Name, Phone, Website, Last_Name, First_Name, Title, Email).
F_ROAD_KM = "Road_Network_Centerline_km"
F_PW_EMAIL = "Public_Works_Email"
F_KEY_DOCS = "Key_Documents"
F_BRIEF = "Account_Brief"
F_STATUS = "Enrichment_Status"
F_LAST = "Last_Enriched"
F_SOURCE = "Enrichment_Source"


def _source_line(cite: dict) -> str:
    page = f", p. {cite['pdf_page']}" if cite.get("pdf_page") else ""
    return f"{cite['url']}{page} (fetched {cite['fetched_at'][:10]})"


def account_upsert(account: dict, fields: dict, brief: dict, status: str, run_at: str) -> dict:
    record = {"Account_Name": account["name"], F_STATUS: STATUS_LABEL[status], F_LAST: run_at}
    road = fields["road_length_km"]
    if road["status"] == "filled":
        record[F_ROAD_KM] = road["value_km"]
    if fields["email"]["status"] == "filled":
        record[F_PW_EMAIL] = fields["email"]["value"]
    if fields["phone"]["status"] == "filled":
        record["Phone"] = fields["phone"]["value"]
    if fields["key_documents"]:
        record[F_KEY_DOCS] = "\n".join(f"{d['title']}: {d['url']}" for d in fields["key_documents"])
    if brief.get("sentences"):
        record[F_BRIEF] = " ".join(s["text"] for s in brief["sentences"])
    return {"method": "POST", "url": f"{API}/Accounts/upsert",
            "body": {"data": [record], "duplicate_check_fields": ["Account_Name"], "trigger": []}}


def contact_request(account: dict, proposal: dict | None, head: dict) -> dict | None:
    if not proposal:
        return None
    first, last = crm_name(head.get("name") or "")
    source = _source_line(head["cite"])
    if proposal["action"] == "merge":
        # Our own match found the record, so update it by id rather than trusting Email as the key.
        record = {"id": proposal["contact_id"], "First_Name": first or None, "Last_Name": last,
                  "Title": head.get("title"), F_SOURCE: source}
        return {"method": "PUT", "url": f"{API}/Contacts", "body": {"data": [record], "trigger": []}}
    c = proposal["contact"]
    record = {"First_Name": first or None, "Last_Name": last, "Title": head.get("title"),
              "Account_Name": {"id": account["crm_id"]}, F_SOURCE: source}
    if c.get("phone"):
        record["Phone"] = c["phone"]
    if c.get("email"):
        record["Email"] = c["email"]
        return {"method": "POST", "url": f"{API}/Contacts/upsert",
                "body": {"data": [record], "duplicate_check_fields": ["Email"], "trigger": []}}
    # No email to deduplicate on, and our match found nobody: create.
    return {"method": "POST", "url": f"{API}/Contacts", "body": {"data": [record], "trigger": []}}


def notes(account: dict, questions: list[dict], fields: dict) -> list[dict]:
    """One Note per open question, with every quote, its source and fetch date."""
    out = []
    road = fields["road_length_km"]
    for q in questions:
        lines = [q["text"], ""]
        for o in road.get("options", []):
            for p in o["parts"]:
                lines.append(f"- \"{p['cite']['quote']}\" ({_source_line(p['cite'])})")
        lines += ["", "Left blank by Enrich Account until someone confirms it."]
        out.append({"Parent_Id": {"module": {"api_name": "Accounts"}, "id": account["crm_id"]},
                    "Note_Title": "Enrich Account: needs a person", "Note_Content": "\n".join(lines)})
    if not out:
        return []
    return [{"method": "POST", "url": f"{API}/Notes", "body": {"data": out}}]


def build(account: dict, fields: dict, proposal: dict | None, brief: dict, questions: list[dict], status: str,
          run_at: str) -> dict:
    return {
        "sent": False,
        "note": "Preview only: nothing is sent. Draft, never run in a Zoho org; field names are guesses.",
        "requests": [r for r in [account_upsert(account, fields, brief, status, run_at),
                                 contact_request(account, proposal, fields["roads_head"])] if r]
                    + notes(account, questions, fields),
    }
