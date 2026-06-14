"""Parse and render ```inner fenced blocks for server-side markdown HTML."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable, Literal

InnerAlign = Literal["left", "center", "right"]

_WIDTH_RE = re.compile(r"^\[(\d+(?:\.\d+)?)%\]\s*")
_ALIGN_CLASS: dict[InnerAlign, str] = {
    "left": "inner-col--left",
    "center": "inner-col--center",
    "right": "inner-col--right",
}


@dataclass
class InnerColumn:
    width_pct: float | None
    align: InnerAlign
    body: str


def parse_inner_line(line: str) -> InnerColumn | None:
    trimmed = line.strip()
    if not trimmed.startswith("-"):
        return None

    rest = trimmed[1:].strip()
    if not rest:
        return InnerColumn(width_pct=None, align="center", body="")

    width_pct: float | None = None
    width_match = _WIDTH_RE.match(rest)
    if width_match:
        width_pct = float(width_match.group(1))
        rest = rest[width_match.end() :]

    align: InnerAlign = "center"
    if rest.startswith("[["):
        align = "left"
        rest = rest[2:].lstrip()
    elif rest.startswith("]]"):
        align = "right"
        rest = rest[2:].lstrip()

    return InnerColumn(width_pct=width_pct, align=align, body=rest)


def parse_inner_block(source: str) -> list[InnerColumn]:
    columns: list[InnerColumn] = []
    for line in source.splitlines():
        col = parse_inner_line(line)
        if col is not None:
            columns.append(col)
    return columns


def resolve_inner_column_widths(columns: list[InnerColumn]) -> list[float]:
    fixed = sum(col.width_pct or 0 for col in columns)
    auto_count = sum(1 for col in columns if col.width_pct is None)
    remainder = max(0.0, 100.0 - fixed)
    auto_share = remainder / auto_count if auto_count else 0.0
    return [col.width_pct if col.width_pct is not None else auto_share for col in columns]


def render_inner_block_html(
    source: str,
    render_markdown: Callable[[str], str],
) -> str:
    columns = parse_inner_block(source)
    if not columns:
        return ""

    grid_template = " ".join(
        f"{int(width) if width == int(width) else width}fr"
        for width in resolve_inner_column_widths(columns)
    )
    cols_html = "".join(
        f'<div class="inner-col {_ALIGN_CLASS[col.align]}">{render_markdown(col.body)}</div>'
        for col in columns
    )
    return f'<div class="inner-row" style="grid-template-columns: {grid_template};">{cols_html}</div>\n'
