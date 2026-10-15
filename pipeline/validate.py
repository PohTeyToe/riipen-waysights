"""The checks. Five rules, each readable in a minute:

1. Every value must appear in its quote, and the quote must appear in the saved
   source text (case and spacing ignored). A road length's unit must be printed
   next to its number, and a money amount is never a length. A sum of printed
   parts is allowed if each part passes, each line once. Ratios, percentages and
   other derived numbers are rejected.
2. Road length must be a length. Lane-km and area are rejected for this field.
   A length that doesn't say centerline goes to a person.
3. New York: a county's owned roads are the sum of county_mileage over its rows.
   The all-roads total is shown beside it, never used as the value.
4. Sources that give different numbers for the same field go to a person with
   every quote. No tolerance rules: an approximate figure agrees with a precise
   one only if the precise one rounds to it at the precision it is printed with
   ("approximately 300 km" and 310 km agree; "close to 302 miles" and 300.62 don't).
5. Emails and phones must be printed on an approved page. Never built from a
   name. (Summary sentences are checked in summarize.py under the same rule.)
"""
from __future__ import annotations

import math
import re
import unicodedata

from .discover import Source

MI_KM = 1.609344
NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")
EMAIL = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
APPROX = re.compile(r"\b(approximately|approx\.?|about|around|close to|nearly|roughly|almost|over|more than)\b|~", re.I)
CENTERLINE = re.compile(r"\bcent(er|re)[ -]?line\b", re.I)
RATIO = re.compile(r"%|\bper\b|/\s*km|km\s*/|\bpercent", re.I)
LANE = re.compile(r"\blane[- ]?(km|kilomet|mi\b|miles?\b)", re.I)
AREA = re.compile(r"\bsquare\b|\bsq\.?\b|m2\b|m²|km2\b|km²|\bhectares?\b|\bacres?\b", re.I)
UNIT_KM = [(re.compile(r"^(km|kms|kilomet(er|re)s?)$", re.I), 1.0),
           (re.compile(r"^(m|meters?|metres?)$", re.I), 0.001),
           (re.compile(r"^(mi|miles?)$", re.I), MI_KM)]
PHRASE_END = re.compile(r";|[.!?](?:\s|$)")
MONEY = ("$", "\u20ac", "\u00a3")
PHONE_MAIN = re.compile(r"\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}")
PHONE_EXT = re.compile(r"(?:\bext\.?|\bx|extension)\s*(\d+)", re.I)


# Typographic variants that PDFs and web pages mix freely.
SAME = {0x00AD: None,                 # soft hyphen
        0x2018: "'", 0x2019: "'",       # curly single quotes
        0x201C: '"', 0x201D: '"',       # curly double quotes
        0x2013: "-", 0x2014: "-",       # en and em dash
        0x00A0: " "}                    # non-breaking space


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "").translate(SAME)
    return " ".join(s.lower().split())


def numbers_in(s: str) -> list[float]:
    return [float(n.replace(",", "")) for n in NUMBER.findall(s)]


def as_number(value: str) -> float | None:
    found = numbers_in(value or "")
    return found[0] if len(found) == 1 else None


def digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def unit_factor(word: str) -> float | None:
    return next((f for pat, f in UNIT_KM if pat.match(word)), None)


def printed_unit(quote: str, n: float, factor: float) -> tuple[str | None, bool]:
    """Where the quote prints this number's unit: the words between the number and the
    next number after it, or the one before it (table rows put the unit in the label,
    "kms of local roads 255"), cut at a semicolon or a sentence end. Returns the words
    that hold a unit of this size (or None), and whether the number is a money amount."""
    q = norm(quote)
    nums = list(NUMBER.finditer(q))
    money = False
    for i, m in enumerate(nums):
        if float(m.group().replace(",", "")) != n:
            continue
        if q[max(0, m.start() - 1):m.start()] in MONEY:
            money = True
            continue
        after = PHRASE_END.split(q[m.end():nums[i + 1].start() if i + 1 < len(nums) else len(q)])[0]
        before = PHRASE_END.split(q[nums[i - 1].end() if i else 0:m.start()])[-1]
        for side in (after, before):
            if any(unit_factor(w) == factor for w in re.findall(r"[a-z]+", side)):
                return side.strip(), False
    return None, money


def phone_line(value: str) -> tuple[str, str]:
    """'905-892-2607 x332' -> ('9058922607', '332'): the main line and the extension, apart."""
    m = PHONE_MAIN.search(value or "")
    if not m:
        return digits(value), ""
    ext = PHONE_EXT.search(value[m.end():])
    return digits(m.group()), (ext.group(1) if ext else "")


def same_line(a: str, b: str) -> bool:
    """One phone line: the same main number, and the same extension or one without any."""
    (ma, ea), (mb, eb) = phone_line(a), phone_line(b)
    return ma == mb and (ea == eb or not ea or not eb)


def rounds_to(printed: str, x: float) -> bool:
    """Does x round to this printed figure, at the precision it is printed with?
    "300" is to the hundred, "302" to the unit, "247.36" to the hundredth."""
    p = printed.replace(",", "")
    step = 10.0 ** -len(p.split(".")[1]) if "." in p else 10.0 ** (len(p) - len(p.rstrip("0")))
    return abs(math.floor(x / step + 0.5) * step - float(p)) < 1e-9


class Checker:
    def __init__(self, sources: list[Source]):
        self.by_id = {s.id: s for s in sources}
        self.rejected: list[dict] = []

    # helpers ---------------------------------------------------------------
    def text_of(self, sid: str, pdf_page: int | None = None) -> str:
        s = self.by_id.get(sid)
        if not s:
            return ""
        if s.kind == "pdf":
            if pdf_page in s.pdf_pages:
                return s.pdf_pages[pdf_page]
            return "\n".join(s.pdf_pages.values())
        return s.text

    def cite(self, sid: str, quote: str, pdf_page: int | None = None) -> dict:
        s = self.by_id[sid]
        page = pdf_page if s.kind == "pdf" else None
        if s.kind == "pdf" and page is None:
            page = next((n for n, t in s.pdf_pages.items() if norm(quote) in norm(t)), None)
        return {"quote": quote, "source": sid, "url": s.url, "title": s.title, "pdf_page": page,
                "fetched_at": s.record["fetched_at"]}

    def reject(self, field: str, value, reason: str, quote: str = "", sid: str = "", pdf_page=None, **extra) -> None:
        item = {"field": field, "value": value, "reason": reason, "quote": quote}
        if sid in self.by_id:
            item.update({k: v for k, v in self.cite(sid, quote, pdf_page).items() if k != "quote"})
        item.update(extra)
        self.rejected.append(item)

    def quote_problem(self, quote: str, sid: str, pdf_page: int | None = None) -> str | None:
        """Rule 1, second half: the quote must be in the saved source text."""
        if sid not in self.by_id:
            return f"cites {sid or 'no source'}, which this run didn't read"
        s = self.by_id[sid]
        if s.kind == "pdf" and pdf_page is not None and pdf_page not in s.pdf_pages:
            return f"cites PDF page {pdf_page}, which this run didn't read"
        if not quote or norm(quote) not in norm(self.text_of(sid, pdf_page)):
            return "quote not found in the saved source text"
        return None

    # rule 1 + 2: road length -----------------------------------------------
    def road_line(self, i: int, line: dict) -> dict | None:
        """A usable road-length line, or None (and a rejection)."""
        value, unit, quote, sid = line.get("value", ""), line.get("unit", ""), line.get("quote", ""), line.get("source", "")
        page = line.get("pdf_page")
        shown = value if value.strip().endswith(unit.strip()) else f"{value} {unit}".strip()
        r = lambda reason: self.reject("road_length_km", shown, reason, quote, sid, page,
                                       model_said=line.get("measures"), road_type=line.get("road_type"))
        problem = self.quote_problem(quote, sid, page)
        if problem:
            return r(problem)
        n = as_number(value)
        if n is None or n not in numbers_in(quote):
            return r("value not printed in its quote")
        context = f"{unit} {quote}"
        if RATIO.search(unit) or line.get("measures") == "ratio":
            return r(f"a ratio{' of lane-km' if LANE.search(context) else ''} ({unit}), not a length")
        if LANE.search(context) or line.get("measures") == "lane_length":
            return r("lane length, not road length")
        if AREA.search(unit) or line.get("measures") == "area":
            return r("an area, not a length")
        # The unit as printed can carry a word in front ("highway miles", "centreline km"): read the last word.
        unit_word = unit.split()[-1].rstrip(".") if unit.split() else ""
        factor = unit_factor(unit_word)
        if factor is None:
            return r(f"unit \"{unit}\" is not a length")
        phrase, money = printed_unit(quote, n, factor)
        if phrase is None:
            return r("a money amount, not a length" if money else f"no {unit_word} printed next to {value}")
        if AREA.search(phrase):
            return r("an area, not a length")
        if RATIO.search(phrase):
            return r("a ratio, not a length")
        if line.get("measures") != "length":
            # The extractor can only make a line stricter, never pass one the checks would refuse.
            return r(f"the extractor marked it \"{line.get('measures')}\", not a road length")
        return {"index": i, "km": n * factor, "value": value, "unit": unit, "road_type": line.get("road_type"),
                "centerline": bool(CENTERLINE.search(quote)), "approximate": bool(APPROX.search(quote)),
                "cite": self.cite(sid, quote, page)}

    def road_length(self, extraction: dict, dataset: Source | None) -> dict:
        lines = extraction.get("road_lines") or []
        ok = {i: self.road_line(i, ln) for i, ln in enumerate(lines)}
        options, partial = [], []
        for total in extraction.get("road_totals") or []:
            idx = total.get("lines") or []
            if len(set(idx)) != len(idx):
                self.reject("road_length_km", " + ".join(str(lines[i].get("value")) for i in idx if 0 <= i < len(lines)),
                            "a total that counts the same line twice")
                continue
            parts = [ok.get(i) for i in idx]
            if not idx or any(p is None for p in parts):
                continue  # a part already failed and was listed as rejected
            km = sum(p["km"] for p in parts)
            entry = {"km": round(km, 1), "parts": parts, "centerline": all(p["centerline"] for p in parts),
                     "approximate": any(p["approximate"] for p in parts), "why": total.get("why")}
            if not total.get("covers_whole_network"):
                partial.append(entry)
                continue
            options.append(entry)
        if dataset:
            options.append(self.ny_owned(dataset))

        # Rule 4: different numbers go to a person. Same number from two sources is one option.
        merged: dict[float, dict] = {}
        for o in options:
            if o["km"] in merged:
                m = merged[o["km"]]
                m["parts"] += o["parts"]
                m["centerline"] = m["centerline"] or o["centerline"]
                m["approximate"] = m["approximate"] and o["approximate"]
            else:
                merged[o["km"]] = o
        opts = list(merged.values())
        # An approximate figure that a precise one rounds to is the same figure, rounded.
        for a in [o for o in opts if o["approximate"]]:
            match = next((o for o in opts if o is not a and agrees(a, o)), None)
            if match:
                match["agrees"] = match.get("agrees", []) + a["parts"]
                match["centerline"] = match["centerline"] or a["centerline"]
                opts.remove(a)
        opts.sort(key=lambda o: (not o["centerline"], o["approximate"]))
        field = {"options": opts, "partial": partial}
        if dataset:
            field["within_km"] = round(dataset.notes["all_roads_mi"] * MI_KM, 1)
            field["within_mi"] = dataset.notes["all_roads_mi"]
            field["within_column"] = dataset.notes["all_roads_column"]
            field["data_year"] = dataset.notes["year"]
        if not opts:
            field.update(status="not_found", value_km=None)
        elif len(opts) == 1 and opts[0]["centerline"]:
            field.update(status="filled", value_km=opts[0]["km"])
        else:
            field.update(status="needs_human", value_km=opts[0]["km"], question=road_question(opts))
        return field

    def ny_owned(self, ds: Source) -> dict:
        """Rule 3. The dataset says what its column measures; that's the centerline check."""
        n = ds.notes
        desc = n["owned_column_description"]
        quote = f"{n['owned_column']}: {desc}"
        cite = self.cite(ds.id, quote)
        cite.update(rows=n["rows"], year=n["year"], sum_mi=n["owned_mi"], column=n["owned_column"])
        return {"km": round(n["owned_mi"] * MI_KM, 1), "centerline": bool(CENTERLINE.search(desc)), "approximate": False,
                "why": f"sum of {n['owned_column']} over {n['rows']} rows, {n['year']}",
                "parts": [{"km": n["owned_mi"] * MI_KM, "value": str(n["owned_mi"]), "unit": "mi",
                           "road_type": "county-owned roads", "centerline": bool(CENTERLINE.search(desc)),
                           "approximate": False, "cite": cite}]}

    # roads head, email, phone (rule 1 and rule 5) ----------------------------
    def roads_head(self, h: dict | None) -> dict:
        if not h:
            return {"status": "not_found"}
        quote, sid = h.get("quote", ""), h.get("source", "")
        problem = self.quote_problem(quote, sid)
        name, title = h.get("name"), h.get("title")
        if problem:
            self.reject("roads_head", ", ".join(x for x in (name, title) if x), problem, quote, sid)
            return {"status": "not_found"}
        out = {"cite": self.cite(sid, quote)}
        if name and norm(name) not in norm(quote):
            self.reject("roads_head", name, "name not printed in its quote", quote, sid)
            name = None
        if title and norm(title) not in norm(quote):
            self.reject("roads_head", title, "title not printed in its quote", quote, sid)
            title = None
        out.update(name=name, title=title, status="filled" if name else ("title_only" if title else "not_found"))
        return out

    def email(self, e: dict | None) -> dict:
        if not e:
            return {"status": "not_found"}
        value, quote, sid = (e.get("value") or "").strip(), e.get("quote", ""), e.get("source", "")
        problem = self.quote_problem(quote, sid) or \
            (None if EMAIL.match(value) else "not an email address") or \
            (None if norm(value) in norm(quote) else "email not printed in its quote")
        if problem:
            self.reject("email", value, problem, quote, sid)
            return {"status": "not_found"}
        return {"status": "filled", "value": value, "cite": self.cite(sid, quote)}

    def phones(self, items: list[dict] | None) -> dict:
        """Rule 5 for each number found for the department, then rule 4: different
        numbers go to a person. A number and the same number with an extension are
        one line, and the extension is kept."""
        lines: list[dict] = []
        for v in (self.phone(p) for p in items or []):
            if v["status"] != "filled":
                continue
            same = next((x for x in lines if same_line(x["value"], v["value"])), None)
            if same is None:
                lines.append(v)
            elif not phone_line(same["value"])[1] and phone_line(v["value"])[1]:
                lines[lines.index(same)] = v
        if not lines:
            return {"status": "not_found"}
        if len(lines) == 1:
            return lines[0]
        return {"status": "needs_human", "values": [x["value"] for x in lines], "cites": [x["cite"] for x in lines]}

    def phone(self, p: dict | None) -> dict:
        if not p:
            return {"status": "not_found"}
        value, quote, sid = (p.get("value") or "").strip(), p.get("quote", ""), p.get("source", "")
        problem = self.quote_problem(quote, sid) or \
            (None if len(digits(value)) >= 10 else "not a full phone number") or \
            (None if digits(value) in digits(quote) else "phone not printed in its quote")
        if problem:
            self.reject("phone", value, problem, quote, sid)
            return {"status": "not_found"}
        return {"status": "filled", "value": value, "cite": self.cite(sid, quote)}

    def sign_work(self, items: list[dict]) -> list[dict]:
        kept = []
        for it in items or []:
            problem = self.quote_problem(it.get("quote", ""), it.get("source", ""))
            if problem:
                self.reject("sign_work", None, problem, it.get("quote", ""), it.get("source", ""))
            else:
                kept.append(self.cite(it["source"], it["quote"]))
        return kept


def agrees(approx: dict, precise: dict) -> bool:
    """Rule 4: an approximate total agrees with a precise one that rounds to it."""
    if precise["approximate"] or len({(p["value"], p["unit"]) for p in approx["parts"]}) != 1:
        return False
    part = approx["parts"][0]
    per_unit = part["km"] / as_number(part["value"])  # km per printed unit
    return rounds_to(part["value"], precise["km"] / per_unit)


def fmt_km(km: float, approximate: bool = False) -> str:
    return f"{'about ' if approximate else ''}{km:,.1f} km".replace(".0 km", " km")


def short_title(title: str) -> str:
    """'Roads & Transportation | Town of Lincoln' -> 'Roads & Transportation'."""
    for sep in (" | ", " – "):
        title = title.split(sep)[0]
    return title.strip()


def option_label(o: dict) -> str:
    srcs = []
    for p in o["parts"]:
        c = p["cite"]
        where = short_title(c["title"]) if c.get("pdf_page") is None else f"{short_title(c['title'])}, p. {c['pdf_page']}"
        if where not in srcs:
            srcs.append(where)
    return f"{fmt_km(o['km'], o['approximate'])} · {' + '.join(srcs)}"


def road_question(opts: list[dict]) -> dict:
    if len(opts) == 1:
        o = opts[0]
        km = fmt_km(o["km"])
        return {"field": "road_length_km", "kind": "centerline",
                "text": f"No source says centerline. Is {km} centerline?",
                "options": [{"label": "Centerline", "value_km": o["km"], "result": "filled"},
                            {"label": "Lane km", "value_km": None, "result": "blank"},
                            {"label": "Not sure", "value_km": None, "result": "note"}]}
    any_cl = any(o["centerline"] for o in opts)
    text = "These sources give different road lengths. Which one is right?" if any_cl else \
        "These sources give different road lengths, and none says centerline. Which one is the centerline length?"
    return {"field": "road_length_km", "kind": "pick", "text": text,
            "options": [{"label": option_label(o), "value_km": o["km"], "result": "filled",
                         "centerline": o["centerline"]} for o in opts] +
                       [{"label": "Not sure", "value_km": None, "result": "note"}]}
