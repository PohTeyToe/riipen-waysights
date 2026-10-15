"""New York road mileage from the state's open data (NYSDOT Highway Mileage,
data.ny.gov dataset tccz-tc3t). The set has no county rows, so a county's own
roads are the sum of county_mileage over its rows for the latest year. The
all-roads column is kept beside it for the "owned or within" question, never
used as the value.
"""
from __future__ import annotations

import json
from urllib.parse import urlencode

from .discover import Source
from .fetch import Fetcher, Refused

DATASET = "tccz-tc3t"
BASE = f"https://data.ny.gov/resource/{DATASET}.json"
META = f"https://data.ny.gov/api/views/{DATASET}.json"
OWNED = "county_mileage"         # a town Account would use local_mileage
ALL_ROADS = "total_centerline_highway_mileage"


def _get_json(f: Fetcher, url: str, why: str):
    page = f.fetch(url, why=why)
    return json.loads(page.body.decode("utf-8")), page


def county_mileage(f: Fetcher, county: str, sid: str) -> Source | None:
    try:
        meta, meta_page = _get_json(f, META, "dataset column descriptions")
        latest, _ = _get_json(f, BASE + "?" + urlencode({"$select": "max(year) as year"}), "latest year in the set")
        year = latest[0]["year"]
        rows, page = _get_json(f, BASE + "?" + urlencode({"$where": f"year='{year}' AND county='{county}'",
                                                           "$order": "municipality", "$limit": 500}),
                               f"{county.title()} County rows for {year}")
    except (Refused, KeyError, ValueError, IndexError):
        return None
    columns = {c["fieldName"]: c.get("description", "") for c in meta.get("columns", [])}
    owned = round(sum(float(r.get(OWNED) or 0) for r in rows), 2)
    total = round(sum(float(r.get(ALL_ROADS) or 0) for r in rows), 2)
    f.log("dataset", f"{len(rows)} rows for {county.title()} County, {year}: {OWNED} sums to {owned} mi, "
                     f"{ALL_ROADS} to {total} mi", url=page.url, rows=len(rows), year=year)
    # The saved text is what validation checks quotes against: the column
    # description plus every row's two columns, as the API returned them.
    lines = [f"{OWNED}: {columns.get(OWNED, '')}", f"{ALL_ROADS}: {columns.get(ALL_ROADS, '')}"]
    lines += [f"{r['municipality']} | {OWNED} {r.get(OWNED)} | {ALL_ROADS} {r.get(ALL_ROADS)}" for r in rows]
    src = Source(sid, page.url, "dataset", f"NYSDOT Highway Mileage, {year} (data.ny.gov)",
                 "state dataset for New York Accounts", page.record(), text="\n".join(lines))
    src.notes = {"year": year, "rows": len(rows), "owned_mi": owned, "all_roads_mi": total,
                 "owned_column": OWNED, "all_roads_column": ALL_ROADS,
                 "owned_column_description": columns.get(OWNED, ""), "meta_url": meta_page.url,
                 "meta_record": meta_page.record(), "row_values": [r.get(OWNED) for r in rows]}
    return src
