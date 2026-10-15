"""No network. Fixtures are saved copies of the real pages (see fixtures/SOURCES.json)."""
from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from pipeline import dedupe, extract, nydata, summarize
from pipeline.allowlist import APPROVED, is_allowed
from pipeline.discover import Discovery, Source, score_link
from pipeline.fetch import Fetcher, HostClock, Refused, RunLog
from pipeline.pages import html_page, pdf_pages, pick_pdf_pages
from pipeline.validate import MI_KM, Checker

FX = Path(__file__).parent / "fixtures"
FETCHED = "2026-10-15T18:00:00.000Z"


def src(sid: str, text: str = "", *, kind: str = "html", url: str = "https://www.example.ca/p", pdf: dict | None = None,
        notes: dict | None = None, title: str = "A page") -> Source:
    s = Source(sid, url, kind, title, "test", {"fetched_at": FETCHED, "sha256": "x"}, text=text,
               pdf_pages=pdf or {})
    s.notes = notes or {}
    return s


def line(value, unit, quote, source="S1", measures="length", road_type="all roads", page=None):
    return {"value": value, "unit": unit, "measures": measures, "road_type": road_type, "quote": quote,
            "source": source, "pdf_page": page}


# --- fake network -------------------------------------------------------------

class FakeResponse:
    def __init__(self, status=200, body=b"", headers=None):
        self.status_code = status
        self._body = body
        self.headers = headers or {"Content-Type": "text/html"}
        self.is_redirect = status in (301, 302, 303, 307, 308) and "Location" in self.headers

    def iter_content(self, n):
        yield self._body

    def close(self):
        pass


class FakeSession:
    def __init__(self, pages: dict[str, FakeResponse]):
        self.pages = pages
        self.headers = {}
        self.calls: list[str] = []

    def mount(self, *a):
        pass

    def get(self, url, **kw):
        self.calls.append(url)
        return self.pages.get(url, FakeResponse(404))


def fetcher(pages, approved=("example.ca",), budget=15):
    clock = HostClock()
    clock.wait = lambda host, delay: 0  # tests don't sleep; the clock has its own test
    return Fetcher(list(approved), RunLog("test"), clock, budget=budget, session=FakeSession(pages))


# --- allowlist and fetching -----------------------------------------------------

def test_allowlist_blocks_off_list_links():
    lincoln = APPROVED["lincoln"]
    assert is_allowed("https://www.lincoln.ca/services/roads-transportation", lincoln)
    assert not is_allowed("https://www.niagararegion.ca/projects/", lincoln)
    assert not is_allowed("https://lincoln.ca.evil.example/", lincoln)
    assert not is_allowed("http://www.lincoln.ca/", lincoln)  # plain http is never fetched
    pelham = APPROVED["pelham"]
    assert is_allowed("https://media-001-ca.cdn.govstack.com/pelham-007-ca/media/x/plan.pdf", pelham)
    assert not is_allowed("https://media-001-ca.cdn.govstack.com/other-town/media/x/plan.pdf", pelham)
    # The HTTP client would resolve "..", so the request would leave the approved folder.
    assert not is_allowed("https://media-001-ca.cdn.govstack.com/pelham-007-ca/../other-town/plan.pdf", pelham)
    assert not is_allowed("https://media-001-ca.cdn.govstack.com/pelham-007-ca/%2e%2e/other-town/plan.pdf", pelham)


def test_discovery_skips_off_list_links_without_fetching():
    home = b'<a href="https://www.niagararegion.ca/works/">Regional Public Works</a><a href="/roads/">Roads</a>'
    f = fetcher({"https://example.ca/robots.txt": FakeResponse(404),
                 "https://example.ca/": FakeResponse(200, home),
                 "https://example.ca/roads/": FakeResponse(200, b"<p>Roads page</p>")})
    Discovery(f, "https://example.ca/", wants_plan=False).run()
    assert "https://www.niagararegion.ca/works/" not in f.session.calls
    assert "https://example.ca/roads/" in f.session.calls
    assert any("off-list link skipped" in ln["msg"] for ln in f.log.lines)


def test_a_broken_pdf_is_skipped_not_fatal():
    home = b'<a href="/media/2025-asset-management-plan.pdf">2025 Asset Management Plan</a>'
    f = fetcher({"https://example.ca/robots.txt": FakeResponse(404),
                 "https://example.ca/": FakeResponse(200, home),
                 "https://example.ca/media/2025-asset-management-plan.pdf":
                     FakeResponse(200, b"<html>Not found</html>", {"Content-Type": "application/pdf"})})
    sources = Discovery(f, "https://example.ca/", wants_plan=True).run()
    assert [s.kind for s in sources] == ["html"]
    assert any("PDF unreadable" in ln["msg"] for ln in f.log.lines)


def test_robots_disallow_is_obeyed():
    f = fetcher({"https://example.ca/robots.txt": FakeResponse(200, b"User-agent: *\nDisallow: /search/\n")})
    with pytest.raises(Refused):
        f.fetch("https://example.ca/search/?q=roads")
    assert f.session.calls == ["https://example.ca/robots.txt"]


def test_robots_redirect_is_read_where_it_lands():
    f = fetcher({"https://example.ca/robots.txt": FakeResponse(301, b"", {"Location": "https://www.example.ca/robots.txt"}),
                 "https://www.example.ca/robots.txt": FakeResponse(200, b"User-agent: *\nDisallow: /private/\n")})
    with pytest.raises(Refused):
        f.fetch("https://example.ca/private/plan")
    assert f.session.calls == ["https://example.ca/robots.txt", "https://www.example.ca/robots.txt"]
    assert f.requests == 2 and f.used == 0  # robots.txt hops are requests, not pages


def test_robots_403_means_dont_crawl():
    f = fetcher({"https://example.ca/robots.txt": FakeResponse(403)})
    with pytest.raises(Refused):
        f.fetch("https://example.ca/")
    assert f.session.calls == ["https://example.ca/robots.txt"]


def test_page_budget_holds():
    pages = {"https://example.ca/robots.txt": FakeResponse(404)}
    pages.update({f"https://example.ca/{i}": FakeResponse(200, b"x") for i in range(3)})
    f = fetcher(pages, budget=2)
    f.fetch("https://example.ca/0")
    f.fetch("https://example.ca/1")
    with pytest.raises(Refused):
        f.fetch("https://example.ca/2")


def test_redirect_off_the_list_is_not_followed():
    f = fetcher({"https://example.ca/robots.txt": FakeResponse(404),
                 "https://example.ca/go": FakeResponse(302, b"", {"Location": "https://elsewhere.com/x"})})
    with pytest.raises(Refused):
        f.fetch("https://example.ca/go")
    assert "https://elsewhere.com/x" not in f.session.calls


def test_per_host_delay_holds():
    clock = HostClock()
    clock.wait("a.example", 0.3)
    t0 = time.monotonic()
    waited_ms = clock.wait("a.example", 0.3)
    assert time.monotonic() - t0 >= 0.25 and waited_ms >= 250
    assert clock.wait("b.example", 0.3) == 0  # another host doesn't wait


def test_project_and_news_links_score_below_the_roads_page():
    assert score_link("Roads & Transportation", "https://www.lincoln.ca/services/roads-transportation") >= 5
    assert score_link("Road Rehabilitation", "https://x.ca/construction-projects/road-rehabilitation/") < 0
    assert score_link("Natural Asset Management Plan", "https://x.ca/natural-asset-management-plan/") < 0
    newer = score_link("2025 Asset Management Plan", "https://x.ca/media/a/2025-asset-management-plan.pdf")
    older = score_link("Asset Management Plan - Core Assets 2021", "https://x.ca/media/b/2022-amp.pdf")
    assert newer > older
    assert score_link("Annual Budget", "https://x.ca/budget.pdf") < 0  # only plans are worth a PDF download


# --- reading pages ----------------------------------------------------------------

def test_lincoln_pdf_page_gives_255_and_55():
    text = pdf_pages((FX / "lincoln-amp-2025-p49.pdf").read_bytes())[0]
    flat = " ".join(text.split())
    assert "Quantity - kms of local roads 255" in flat
    assert "Quantity - kms of collector roads 55" in flat
    assert pick_pdf_pages([text])[0][0] == 1


def test_cloudflare_hidden_email_is_not_decoded():
    title, text, links, notes = html_page((FX / "warren-dpw.html").read_bytes(), "https://warrencountyny.gov/dpw")
    assert notes["hidden_emails"] >= 1
    assert "[email hidden from scripts]" in text
    assert "Kevin J. Hajos" in text
    assert "@warrencountyny.gov" not in text


def test_mailto_link_counts_as_printed():
    _, text, _, _ = html_page(b'<p>Report it to our <a href="mailto:infrastructure@example.ca">Infrastructure '
                              b'Department</a> or call 905-555-0100 ext. 5</p>', "https://example.ca/")
    assert "Infrastructure Department (infrastructure@example.ca) or call 905-555-0100 ext. 5" in text


def test_text_after_a_line_break_is_kept():
    # On this page html.parser nests the lines after <br /> inside the <br>; they must survive.
    _, text, _, _ = html_page((FX / "saratoga-public-works.html").read_bytes(),
                              "https://www.saratogacountyny.gov/departments/public-works/")
    assert "Chad M. Cooke, P.E., Commissioner of Public Works" in text
    assert "Phone: (518) 885-2235" in text


def test_lincoln_roads_page_text_keeps_the_contact_lines():
    _, text, _, _ = html_page((FX / "lincoln-roads-transportation.html").read_bytes(),
                              "https://www.lincoln.ca/services/roads-transportation")
    assert "publicworks@lincoln.ca" in text
    assert "approximately 300km of roadway" in text


# --- rule 1: quotes and printed values ---------------------------------------------

def test_quote_check_passes_and_fails():
    c = Checker([src("S1", "Currently, Public Works oversees approximately 300km of roadway including 49 bridges.")])
    ok = c.road_line(0, line("300", "km", "Public Works  oversees APPROXIMATELY 300km of roadway"))
    assert ok and ok["km"] == 300 and ok["approximate"]
    assert c.road_line(1, line("300", "km", "Public Works oversees about 300km of roadway")) is None
    assert c.rejected[-1]["reason"] == "quote not found in the saved source text"


def test_value_must_be_printed_in_its_quote():
    c = Checker([src("S1", "Roadway 248 km $377.6 M")])
    assert c.road_line(0, line("250", "km", "Roadway 248 km $377.6 M")) is None
    assert c.rejected[-1]["reason"] == "value not printed in its quote"


def test_the_unit_must_be_printed_next_to_the_number():
    c = Checker([src("S1", "Centerline roads 25 km; replacement cost $100. Paved 40 km; total 100.")])
    assert c.road_line(0, line("100", "miles", "Centerline roads 25 km; replacement cost $100")) is None
    assert c.rejected[-1]["reason"] == "a money amount, not a length"
    assert c.road_line(1, line("100", "km", "Paved 40 km; total 100.")) is None
    assert c.rejected[-1]["reason"] == "no km printed next to 100"
    # Table rows put the unit in the label.
    lincoln = Checker([src("S1", "Quantity - kms of local roads 255")])
    assert lincoln.road_line(0, line("255", "kms", "Quantity - kms of local roads 255"))["km"] == 255


def test_a_total_cannot_count_one_line_twice():
    c = Checker([src("S1", "Centreline roads 25 km")])
    ext = {"road_lines": [line("25", "km", "Centreline roads 25 km")],
           "road_totals": [{"lines": [0, 0], "covers_whole_network": True, "why": "twice"}]}
    assert c.road_length(ext, None)["status"] == "not_found"
    assert c.rejected[-1]["reason"] == "a total that counts the same line twice"


def test_a_quote_cannot_cite_a_pdf_page_the_run_did_not_read():
    c = Checker([src("S1", kind="pdf", pdf={67: "Paved Roads 354,749 Meters $124,346,663 CPI"})])
    assert c.road_line(0, line("354,749", "Meters", "Paved Roads 354,749 Meters", page=999)) is None
    assert c.rejected[-1]["reason"] == "cites PDF page 999, which this run didn't read"


def test_derived_number_is_rejected():
    text = (FX / "pelham-road-rehabilitation.txt").read_text(encoding="utf-8")
    quote = ("with an average of 7 km of pavement being rehabilitated each year, which equates to approximately "
             "2.8% of roads within the Town.")
    c = Checker([src("S1", text)])
    # 7 / 0.028 = 250 km is not printed anywhere.
    assert c.road_line(0, line("250", "km", quote)) is None
    assert c.rejected[-1]["reason"] == "value not printed in its quote"
    assert c.road_line(1, line("2.8", "%", quote, measures="ratio")) is None
    assert "ratio" in c.rejected[-1]["reason"]


# --- rule 2: lengths only ----------------------------------------------------------------

def test_lane_km_and_area_are_rejected():
    p67 = (FX / "west-lincoln-amp-2025-p67.txt").read_text(encoding="utf-8")
    c = Checker([src("S1", "Lane-km of local roads (MMS classes 5 and 6) per land area (km/km2) 0.84"),
                 src("S2", kind="pdf", pdf={67: p67})])
    assert c.road_line(0, line("0.84", "km/km2", "Lane-km of local roads (MMS classes 5 and 6) per land area "
                                                 "(km/km2) 0.84", measures="ratio")) is None
    assert c.road_line(1, line("612,230", "Square Meters", "Unpaved Roads 612,230 Square Meters $15,851,105 CPI",
                               source="S2", measures="area", page=67)) is None
    assert c.rejected[-1]["reason"] == "an area, not a length"
    # The printed words decide, even when the extractor drops "Square" from the unit and calls it a length.
    assert c.road_line(3, line("612,230", "Meters", "Unpaved Roads 612,230 Square Meters $15,851,105 CPI",
                               source="S2", page=67)) is None
    assert c.rejected[-1]["reason"] == "an area, not a length"
    paved = c.road_line(2, line("354,749", "Meters", "Paved Roads 354,749 Meters $124,346,663 CPI", source="S2",
                                road_type="paved roads", page=67))
    assert paved and round(paved["km"], 1) == 354.7 and not paved["centerline"]


def test_a_unit_with_a_word_in_front_still_counts_but_lane_miles_do_not():
    c = Checker([src("S1", "The Highway Department maintains close to 302 highway miles and 109 bridges. "
                           "It also plows 640 lane miles.")])
    ok = c.road_line(0, line("302", "highway miles", "maintains close to 302 highway miles and 109 bridges"))
    assert ok and round(ok["km"], 1) == 486.0 and ok["approximate"]
    assert c.road_line(1, line("640", "lane miles", "It also plows 640 lane miles.")) is None
    assert c.rejected[-1]["reason"] == "lane length, not road length"


def test_part_of_the_network_is_not_a_road_length():
    p67 = (FX / "west-lincoln-amp-2025-p67.txt").read_text(encoding="utf-8")
    c = Checker([src("S1", kind="pdf", pdf={67: p67})])
    ext = {"road_lines": [line("354,749", "Meters", "Paved Roads 354,749 Meters $124,346,663 CPI", page=67,
                               road_type="paved roads")],
           "road_totals": [{"lines": [0], "covers_whole_network": False, "why": "unpaved roads are given as area"}]}
    field = c.road_length(ext, None)
    assert field["status"] == "not_found" and field["partial"][0]["km"] == 354.7


def test_km_without_centerline_goes_to_a_person():
    c = Checker([src("S1", "Roadway 248 km $377.6 M")])
    ext = {"road_lines": [line("248", "km", "Roadway 248 km $377.6 M")],
           "road_totals": [{"lines": [0], "covers_whole_network": True, "why": "one row"}]}
    field = c.road_length(ext, None)
    assert field["status"] == "needs_human"
    assert [o["label"] for o in field["question"]["options"]] == ["Centerline", "Lane km", "Not sure"]


# --- rule 3: New York owned vs within ------------------------------------------------------

def ny_source(rows):
    f = fetcher({
        "https://data.ny.gov/robots.txt": FakeResponse(404),
        nydata.META: FakeResponse(200, json.dumps({"columns": [
            {"fieldName": "county_mileage",
             "description": "County-owned highway centerline mileage that is located within each city, town, and village"},
            {"fieldName": "total_centerline_highway_mileage",
             "description": "The sum of all local and state highway mileage appears in this column."}]}).encode(),
            {"Content-Type": "application/json"}),
    }, approved=("data.ny.gov",))
    f.session.get = lambda url, **kw: (f.session.calls.append(url) or
                                       (f.session.pages.get(url) or FakeResponse(
                                           200, json.dumps([{"year": "2020"}] if "max" in url else rows).encode(),
                                           {"Content-Type": "application/json"})))
    return nydata.county_mileage(f, "SARATOGA", "S9")


def test_mi_to_km_is_exact():
    assert MI_KM == 1.609344
    assert round(364.21 * MI_KM, 1) == 586.1


def test_owned_vs_total_picks_county_mileage():
    rows = [{"municipality": "Town of A", "county_mileage": "200.11", "total_centerline_highway_mileage": "1000.5"},
            {"municipality": "Town of B", "county_mileage": "164.10", "total_centerline_highway_mileage": "1250.03"}]
    ds = ny_source(rows)
    field = Checker([ds]).road_length({"road_lines": [], "road_totals": []}, ds)
    assert field["status"] == "filled"
    assert field["value_km"] == round(364.21 * MI_KM, 1)
    assert field["within_km"] == round(2250.53 * MI_KM, 1)  # shown beside it, never the value


# --- rule 4: disagreeing sources -----------------------------------------------------------

def test_two_sources_that_disagree_go_to_a_person_with_a_pick():
    page = src("S1", "Repair and upkeep of County Highways and appurtenances on 247.36 miles of highway;")
    rows = [{"municipality": "Town of A", "county_mileage": "244.31", "total_centerline_highway_mileage": "1229.82"}]
    ds = ny_source(rows)
    ext = {"road_lines": [line("247.36", "miles", "on 247.36 miles of highway", road_type="county highways")],
           "road_totals": [{"lines": [0], "covers_whole_network": True, "why": "county highways"}]}
    field = Checker([page, ds]).road_length(ext, ds)
    assert field["status"] == "needs_human" and field["question"]["kind"] == "pick"
    kms = [o["value_km"] for o in field["question"]["options"] if o["value_km"]]
    assert kms == [393.2, 398.1]  # the one the source calls centerline first


def test_an_approximate_figure_that_rounds_the_precise_one_is_not_a_second_option():
    plan = src("S1", "Quantity - kms of local roads 255\nQuantity - kms of collector roads 55", kind="pdf",
               pdf={49: "Quantity - kms of local roads 255\nQuantity - kms of collector roads 55"})
    page = src("S2", "Currently, Public Works oversees approximately 300km of roadway including 49 bridges.")
    ext = {"road_lines": [line("255", "kms", "Quantity - kms of local roads 255", page=49),
                          line("55", "kms", "Quantity - kms of collector roads 55", page=49),
                          line("300", "km", "oversees approximately 300km of roadway", source="S2")],
           "road_totals": [{"lines": [0, 1], "covers_whole_network": True, "why": "local and collector"},
                           {"lines": [2], "covers_whole_network": True, "why": "approximate total"}]}
    field = Checker([plan, page]).road_length(ext, None)
    assert [o["km"] for o in field["options"]] == [310]
    assert field["options"][0]["agrees"][0]["value"] == "300"
    assert field["question"]["kind"] == "centerline"  # one figure, and no source says centerline


def test_an_approximate_figure_that_does_not_round_to_it_still_asks():
    page = src("S1", "The Highway Department maintains close to 302 highway miles and 109 bridges.")
    rows = [{"municipality": "Town of A", "county_mileage": "300.62", "total_centerline_highway_mileage": "1500"}]
    ds = ny_source(rows)
    ext = {"road_lines": [line("302", "highway miles", "maintains close to 302 highway miles and 109 bridges")],
           "road_totals": [{"lines": [0], "covers_whole_network": True, "why": "one figure"}]}
    field = Checker([page, ds]).road_length(ext, ds)
    assert field["question"]["kind"] == "pick" and len(field["options"]) == 2


# --- rule 5: emails and phones ------------------------------------------------------------------

def test_unprinted_email_is_rejected():
    c = Checker([src("S1", "Kevin J. Hajos, P.E. Superintendent of Public Works Email Kevin: [email hidden from scripts]")])
    assert c.email({"value": "khajos@warrencountyny.gov", "quote": "Email Kevin: [email hidden from scripts]",
                    "source": "S1"})["status"] == "not_found"
    assert c.rejected[-1]["field"] == "email"
    good = Checker([src("S1", "Public Works\n905-563-2799\npublicworks@lincoln.ca")])
    assert good.email({"value": "publicworks@lincoln.ca", "quote": "publicworks@lincoln.ca",
                       "source": "S1"})["status"] == "filled"


def test_phone_must_be_printed():
    c = Checker([src("S1", "Phone: (518) 885-2235")])
    assert c.phone({"value": "(518) 885-2235", "quote": "Phone: (518) 885-2235", "source": "S1"})["status"] == "filled"
    assert c.phone({"value": "(518) 885-9999", "quote": "Phone: (518) 885-2235", "source": "S1"})["status"] == "not_found"


def test_two_different_department_numbers_go_to_a_person():
    plans = src("S2", "please contact the Public Works & Utilities Department at 905-892-2607 x332.")
    directory = src("S5", "Public Works\nPhone: 905-892-2607 ext. 33\nFax: 905-892-5055")
    c = Checker([plans, directory])
    got = c.phones([{"value": "905-892-2607 x332", "quote": "Department at 905-892-2607 x332.", "source": "S2"},
                    {"value": "905-892-2607 ext. 33", "quote": "Phone: 905-892-2607 ext. 33", "source": "S5"}])
    assert got["status"] == "needs_human" and got["values"] == ["905-892-2607 x332", "905-892-2607 ext. 33"]
    # The same line with and without its extension is one number, and the extension is kept.
    one = c.phones([{"value": "905-892-2607", "quote": "905-892-2607 x332", "source": "S2"},
                    {"value": "905-892-2607 x332", "quote": "905-892-2607 x332", "source": "S2"}])
    assert one["status"] == "filled" and one["value"] == "905-892-2607 x332"


def test_roads_head_name_must_be_in_its_quote():
    c = Checker([src("S1", "Chad M. Cooke, P.E., Commissioner of Public Works")])
    h = c.roads_head({"name": "Chad M. Cooke", "title": "Commissioner of Public Works",
                      "quote": "Chad M. Cooke, P.E., Commissioner of Public Works", "source": "S1"})
    assert h["status"] == "filled"
    h = c.roads_head({"name": "Chad Cooke", "title": "Commissioner of Public Works",
                      "quote": "Chad M. Cooke, P.E., Commissioner of Public Works", "source": "S1"})
    assert h["status"] == "title_only" and c.rejected[-1]["reason"] == "name not printed in its quote"


# --- dedupe -----------------------------------------------------------------------------------------

SEED_CONTACT = {"id": "sample-contact-001", "name": "K. Hajos", "title": "Highway Superintendent",
                "phone": "(518) 761-6556", "email": None}


def test_merge_fires_on_k_hajos():
    p = dedupe.propose({"name": "Kevin J. Hajos", "title": "Superintendent of Public Works", "phone": "(518) 761-6556"},
                       [SEED_CONTACT])
    assert p["action"] == "merge" and p["contact_id"] == "sample-contact-001"
    assert p["changes"]["title"] == {"from": "Highway Superintendent", "to": "Superintendent of Public Works"}


def test_crm_name_drops_post_nominals():
    assert dedupe.crm_name("Kevin J. Hajos, P.E.") == ("Kevin J.", "Hajos")
    assert dedupe.crm_name("Nicholas (Nick) Ensign") == ("Nicholas", "Ensign")
    assert dedupe.crm_name("Mike DiPaola") == ("Mike", "DiPaola")


def test_writeback_updates_the_matched_contact_by_id():
    from pipeline import writeback
    head = {"name": "Kevin J. Hajos, P.E.", "title": "Superintendent of Public Works",
            "cite": {"url": "https://warrencountyny.gov/dpw", "fetched_at": FETCHED, "pdf_page": None}}
    merge = dedupe.propose({"name": head["name"], "phone": "(518) 761-6556"}, [SEED_CONTACT])
    req = writeback.contact_request({"crm_id": "sample-acct-005"}, merge, head)
    assert req["method"] == "PUT" and req["body"]["data"][0]["id"] == "sample-contact-001"
    assert (req["body"]["data"][0]["First_Name"], req["body"]["data"][0]["Last_Name"]) == ("Kevin J.", "Hajos")
    new = writeback.contact_request({"crm_id": "sample-acct-005"}, {"action": "create", "contact": {}}, head)
    assert new["method"] == "POST" and "Phone" not in new["body"]["data"][0] and "Email" not in new["body"]["data"][0]


def test_no_merge_on_a_different_surname_or_surname_alone():
    assert dedupe.propose({"name": "Kevin J. Hayes", "phone": "(518) 761-6556"}, [SEED_CONTACT])["action"] == "create"
    assert dedupe.propose({"name": "Martin Hajos", "phone": "(518) 555-0100"}, [SEED_CONTACT])["action"] == "create"


def test_different_full_first_names_never_match():
    karen = {"id": "c2", "name": "Karen Hajos", "title": "Clerk", "phone": "(518) 761-6556", "email": None}
    assert dedupe.propose({"name": "Kevin J. Hajos", "phone": "(518) 555-0199"}, [karen])["action"] == "create"
    # Not even on the department's shared line.
    assert dedupe.propose({"name": "Kevin J. Hajos", "phone": "(518) 761-6556"}, [karen])["action"] == "create"


def test_the_account_is_updated_by_its_id_and_the_department_phone_has_its_own_field():
    from pipeline import writeback
    fields = {"road_length_km": {"status": "needs_human"}, "email": {"status": "not_found"},
              "phone": {"status": "filled", "value": "905-563-2799"}, "key_documents": [],
              "roads_head": {"status": "not_found"}}
    req = writeback.account_update({"crm_id": "sample-acct-001", "name": "Town of Lincoln"}, fields, {}, "needs_review",
                                   FETCHED)
    assert (req["method"], req["url"].rsplit("/", 1)[1]) == ("PUT", "Accounts")
    record = req["body"]["data"][0]
    assert record["id"] == "sample-acct-001" and "Account_Name" not in record
    assert record["Public_Works_Phone"] == "905-563-2799" and "Phone" not in record
    failed = writeback.build({"crm_id": "sample-acct-001", "name": "x"}, {**fields, "phone": {"status": "not_found"}},
                             None, {}, [], "failed", FETCHED, [{"url": "https://example.ca/", "reason": "HTTP 503"}])
    first = failed["requests"][0]["body"]["data"][0]
    assert first["Enrichment_Status"] == "Failed" and "Last_Enriched" not in first  # a failed run can be retried
    assert "HTTP 503" in failed["requests"][-1]["body"]["data"][0]["Note_Content"]


# --- the brief ----------------------------------------------------------------------------------------

def test_brief_sentences_must_be_cited_checked_and_backed_by_what_they_cite(monkeypatch):
    page = src("S2", "The Tompkins County Highway Department also maintains more than 5,000 signs.\n"
                     "Non-Emergency\n(607) 274-0300")
    phone_cite = {"quote": "(607) 274-0300", "source": "S2", "url": page.url, "title": "Highway", "pdf_page": None,
                  "fetched_at": FETCHED}
    fields = {"road_length_km": {"status": "needs_human"}, "roads_head": {"status": "not_found"},
              "email": {"status": "not_found"}, "phone": {"status": "filled", "value": "(607) 274-0300", "cite": phone_cite},
              "key_documents": []}
    sign = [{"quote": "The Tompkins County Highway Department also maintains more than 5,000 signs.", "source": "S2"}]
    reply = {"sentences": [
        {"text": "The Highway Department says it maintains more than 5,000 signs.", "cites": ["S2"]},
        {"text": "The county bought a sign inventory system last year.", "cites": ["S2"]},
        {"text": 'The department says it "replaced every sign".', "cites": ["S2"]},
        {"text": 'It also says it "maintains more than" its share of signs.', "cites": ["S2"]},
        {"text": "Signs matter a great deal.", "cites": []},
        {"text": "Waysights finds signs 4x faster.", "cites": ["W1"]},
        {"text": "Next step: confirm with Public Works.", "cites": ["S7"]},
        {"text": "Next step: call the Highway Department at (607) 274-0300.", "cites": ["S2"]},
    ]}
    monkeypatch.setattr(extract, "PROVIDER", lambda system, prompt, schema: (reply, "test-model"))
    rejected: list[dict] = []
    account = {"name": "Tompkins County", "region": "New York", "jurisdiction": "NY"}
    w1 = src("W1", "Inspect signs four times faster.", url="https://waysights.com/faq/")
    out = summarize.brief(account, fields, sign, [w1], [page], rejected)
    assert [s["text"] for s in out["sentences"]] == [
        "The Highway Department says it maintains more than 5,000 signs.",
        'It also says it "maintains more than" its share of signs.',  # backed by the words it quotes
        "Next step: call the Highway Department at (607) 274-0300."]
    reasons = [r["reason"] for r in rejected]
    assert "nothing in it comes from S2" in reasons  # a claim the cited page doesn't make
    assert 'quotes words its pages don\'t print: "replaced every sign"' in reasons
    assert "cites no source this run read" in reasons
    assert any(r.startswith("has a number that isn't a checked value") for r in reasons)
    assert out["model"] == "test-model"


# --- the service the button calls ------------------------------------------------------------------

def test_service_auth_allowlist_and_daily_limit(monkeypatch):
    from fastapi.testclient import TestClient
    from pipeline import service

    monkeypatch.setenv("ENRICH_SHARED_SECRET", "s3cret")
    monkeypatch.setattr(service, "run_job", lambda job_id, row: service.jobs[job_id].update(status="done"))
    service.jobs.clear()
    service.last_run.clear()
    client = TestClient(service.app)
    body = {"account_id": "sample-acct-001", "website": "https://www.lincoln.ca/"}

    assert client.post("/enrich", json=body).status_code == 401
    assert client.post("/enrich", json=body, headers={"X-Enrich-Secret": "wrong"}).status_code == 401
    off_list = {"account_id": "sample-acct-001", "website": "https://www.example.com/"}
    assert client.post("/enrich", json=off_list, headers={"X-Enrich-Secret": "s3cret"}).status_code == 422

    r = client.post("/enrich", json=body, headers={"X-Enrich-Secret": "s3cret"})
    assert r.status_code == 202 and r.json()["status"] == "queued"
    job = client.get(f"/jobs/{r.json()['job_id']}", headers={"X-Enrich-Secret": "s3cret"}).json()
    assert job["status"] == "done"
    again = client.post("/enrich", json=body, headers={"X-Enrich-Secret": "s3cret"})
    assert again.status_code == 429  # one run per Account per day
