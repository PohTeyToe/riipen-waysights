"""Rule 4 at other tolerances, on the run's saved model output.

The page has a slider that re-runs rule 4 in the browser (src/lib/rule4.ts). This script runs the
real Checker.road_length on each Account's saved extraction and saved page text at a range of
tolerances and writes what it decides, so the page's test can check the browser against the
pipeline instead of against a copy of its logic. No network, no model call.

    pipeline/.venv/Scripts/python.exe -m pipeline.sweep_near
"""
import json
from pathlib import Path

from pipeline import validate
from pipeline.discover import Source

ROOT = Path(__file__).resolve().parent.parent
RUN = ROOT / "data" / "run"
OUT = ROOT / "src" / "lib" / "rule4.sweep.json"
# 0% to 5% in steps of 0.1%, plus each county's exact gap is covered by the steps around it.
NEARS = [round(i / 1000, 3) for i in range(0, 51)]


def sources_for(run: dict, pages: list[dict]) -> tuple[list[Source], Source | None]:
    saved = {p["id"]: p for p in pages}
    out, dataset = [], None
    for s in run["sources"]:
        p = saved.get(s["id"], {})
        src = Source(id=s["id"], url=s["url"], kind=s["kind"], title=s["title"], found_via=s.get("found_via") or "",
                     record={"fetched_at": s["fetched_at"]}, text=p.get("text") or "",
                     pdf_pages={int(k): v for k, v in (p.get("pdf_pages") or {}).items()},
                     notes=s.get("dataset") or {})
        out.append(src)
        if s["kind"] == "dataset":
            dataset = src
    return out, dataset


def decide(run: dict, pages: list[dict], near: float) -> dict:
    validate.NEAR = near
    sources, dataset = sources_for(run, pages)
    field = validate.Checker(sources).road_length(run["extracted"], dataset)
    return {"status": field["status"], "value_km": field.get("value_km"),
            "options": [o["km"] for o in field["options"]]}


def main() -> None:
    recorded = validate.NEAR
    result: dict[str, dict] = {}
    try:
        for path in sorted(RUN.glob("*.json")):
            if path.name == "meta.json":
                continue
            run = json.loads(path.read_text(encoding="utf-8"))
            pages = json.loads((RUN / "pages" / path.name).read_text(encoding="utf-8"))
            slug = run["account"]["slug"]
            # The sweep is only worth anything if it reproduces the run at the recorded setting.
            same = decide(run, pages, recorded)
            saved = run["validated"]["road_length_km"]
            assert same == {"status": saved["status"], "value_km": saved.get("value_km"),
                            "options": [o["km"] for o in saved["options"]]}, (slug, same)
            result[slug] = {f"{n:.3f}": decide(run, pages, n) for n in NEARS}
    finally:
        validate.NEAR = recorded
    OUT.write_text(json.dumps({"recorded_near": recorded, "by_account": result}, indent=1) + "\n",
                   encoding="utf-8", newline="\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(result)} Accounts x {len(NEARS)} tolerances")


if __name__ == "__main__":
    main()
