"""LLM extraction behind one function, so any model can drop in.

complete_json(system, prompt, schema) -> (output, model_id)

The default provider shells out to the Claude Code CLI (`claude -p`), which is
how this offline run was made. Swap PROVIDER for an API client in production.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Callable

from .discover import Source

PROMPTS = Path(__file__).parent / "prompts"
MODEL = "claude-opus-5-5"
MAX_CHARS_PER_SOURCE = 25_000

QUOTE = {"type": "string"}
SRC = {"type": "string", "description": "source id, e.g. S3"}
PAGE = {"type": ["integer", "null"]}

EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "road_lines": {"type": "array", "items": {"type": "object", "properties": {
            "value": {"type": "string"}, "unit": {"type": "string"},
            "measures": {"type": "string", "enum": ["length", "lane_length", "area", "ratio", "other"]},
            "road_type": {"type": "string"}, "quote": QUOTE, "source": SRC, "pdf_page": PAGE},
            "required": ["value", "unit", "measures", "road_type", "quote", "source"]}},
        "road_totals": {"type": "array", "items": {"type": "object", "properties": {
            "lines": {"type": "array", "items": {"type": "integer"}},
            "covers_whole_network": {"type": "boolean"}, "why": {"type": "string"}},
            "required": ["lines", "covers_whole_network", "why"]}},
        "roads_head": {"type": ["object", "null"], "properties": {
            "name": {"type": ["string", "null"]}, "title": {"type": ["string", "null"]},
            "quote": QUOTE, "source": SRC}, "required": ["name", "title", "quote", "source"]},
        "department_email": {"type": ["object", "null"], "properties": {
            "value": {"type": "string"}, "quote": QUOTE, "source": SRC}, "required": ["value", "quote", "source"]},
        "department_phones": {"type": "array", "items": {"type": "object", "properties": {
            "value": {"type": "string"}, "quote": QUOTE, "source": SRC}, "required": ["value", "quote", "source"]}},
        "sign_work": {"type": "array", "items": {"type": "object", "properties": {
            "quote": QUOTE, "source": SRC}, "required": ["quote", "source"]}},
    },
    "required": ["road_lines", "road_totals", "roads_head", "department_email", "department_phones", "sign_work"],
}


def claude_cli(system: str, prompt: str, schema: dict, model: str = MODEL) -> tuple[dict, str]:
    exe = shutil.which("claude")
    if not exe:
        raise RuntimeError("claude CLI not found")
    # No tools, no user or project settings: the model sees only this prompt.
    cmd = [exe, "-p", "--model", model, "--tools", "", "--setting-sources", "", "--system-prompt", system,
           "--output-format", "json", "--json-schema", json.dumps(schema), "--no-session-persistence"]
    proc = subprocess.run(cmd, input=prompt, capture_output=True, text=True, encoding="utf-8", timeout=900)
    if proc.returncode != 0:
        raise RuntimeError(f"claude CLI failed: {proc.stderr[-500:] or proc.stdout[-500:]}")
    out = json.loads(proc.stdout)
    if out.get("is_error") or "structured_output" not in out:
        raise RuntimeError(f"claude CLI returned no structured output: {str(out.get('result'))[:300]}")
    model_id = next(iter(out.get("modelUsage", {})), model)
    return out["structured_output"], model_id


PROVIDER: Callable[[str, str, dict], tuple[dict, str]] = claude_cli


def complete_json(system: str, prompt: str, schema: dict) -> tuple[dict, str]:
    return PROVIDER(system, prompt, schema)


def source_block(s: Source) -> str:
    if s.kind == "pdf":
        return "\n\n".join(f"[{s.id}] pdf {s.url} page {n}\n{t[:MAX_CHARS_PER_SOURCE]}" for n, t in s.pdf_pages.items())
    return f"[{s.id}] {s.kind} {s.url}\n{s.text[:MAX_CHARS_PER_SOURCE]}"


def extract(account: dict, sources: list[Source]) -> tuple[dict, str, str]:
    """Returns (extraction, model_id, prompt_text)."""
    template = (PROMPTS / "extract.md").read_text(encoding="utf-8")
    blocks = "\n\n".join(source_block(s) for s in sources if s.kind in ("html", "pdf") and (s.text or s.pdf_pages))
    prompt = template.replace("{account_name}", account["name"]).replace("{region}", account["region"]) \
        .replace("{sources}", blocks)
    system = "You extract facts from municipal documents into JSON. Copy quotes exactly. Never guess."
    out, model_id = complete_json(system, prompt, EXTRACT_SCHEMA)
    return out, model_id, prompt
