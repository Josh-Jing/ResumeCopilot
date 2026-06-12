#!/usr/bin/env python3
"""ResumeCopilot template helper.

Read-only validator for Section v2 templates. It intentionally does not edit
files and does not call complex template mutation APIs.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

DEFAULT_BACKEND = "http://127.0.0.1:8901"
LEGACY_PLACEHOLDER_ALLOWLIST = set()
HEADING_SCALE_RATIOS = {
    '[data-section-type="name"]': 34 / 14,
    ".resume-section-content h1": 28 / 14,
    ".resume-section-title": 1.0,
    ".resume-section-content h2": 1.0,
    ".resume-section-content h3": 12.5 / 14,
    ".resume-section-content h4": 11.25 / 14,
    ".resume-section-content h5": 10.5 / 14,
    ".resume-section-content h6": 10 / 14,
}
HEADING_SCALE_TOLERANCE = 0.04

PHOTO_LAYOUT_RATIO = 0.75
PHOTO_LAYOUT_TOLERANCE_RATIO = 0.04
PHOTO_LAYOUT_TOLERANCE_ALIGNMENT = 2  # px
PHOTO_LAYOUT_MIN_GAP = 1  # px — must not overlap divider
PHOTO_LAYOUT_MAX_GAP = 8  # px — must stay close to divider


class AnchorParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.special_counts: dict[str, int] = {}
        self.slot_counts: dict[str, int] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = {k: v for k, v in attrs}
        section_type = attr_map.get("data-section-type")
        if section_type:
            self.special_counts[section_type] = self.special_counts.get(section_type, 0) + 1
        slot = attr_map.get("data-sections-slot")
        if slot:
            self.slot_counts[slot] = self.slot_counts.get(slot, 0) + 1


def _normalize_css_selector(selector: str) -> str:
    return re.sub(r"\s+", " ", selector.strip())


def _normalize_font_size(value: str) -> str:
    value = value.strip().lower()
    match = re.match(r"^([0-9]+(?:\.[0-9]+)?)([a-z%]+)$", value)
    if not match:
        return value
    number, unit = match.groups()
    number = number.rstrip("0").rstrip(".") if "." in number else number
    return f"{number}{unit}"


def _extract_css_property(template_html: str, target_selector: str, property_name: str) -> str | None:
    css_chunks = re.findall(r"<style[^>]*>(.*?)</style>", template_html, flags=re.S | re.I)
    css = "\n".join(css_chunks)
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    normalized_target = _normalize_css_selector(target_selector)

    for selectors, declarations in re.findall(r"([^{}]+)\{([^{}]*)\}", css, flags=re.S):
        selector_list = [_normalize_css_selector(part) for part in selectors.split(",")]
        if normalized_target not in selector_list:
            continue
        match = re.search(rf"{re.escape(property_name)}\s*:\s*([^;]+)", declarations, flags=re.I)
        if match:
            return match.group(1).strip().lower()
    return None


def _extract_css_font_size(template_html: str, target_selector: str) -> str | None:
    value = _extract_css_property(template_html, target_selector, "font-size")
    return _normalize_font_size(value) if value else None


def _parse_css_size_pt(value: str | None) -> float | None:
    """Parse a CSS font-size into pt units for relative-scale checks."""
    if value is None:
        return None
    match = re.match(r"^([0-9]+(?:\.[0-9]+)?)(pt|px|rem|em)$", value.strip().lower())
    if not match:
        return None
    number = float(match.group(1))
    unit = match.group(2)
    if unit == "pt":
        return number
    if unit == "px":
        return number * 0.75
    if unit in {"rem", "em"}:
        # CSS initial font-size is 16px = 12pt. This is an approximation for
        # simple templates; complex cascades should be checked visually.
        return number * 12
    return None


def _format_ratio(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def _has_header_divider(template_html: str) -> bool:
    """Best-effort detection for the required Header Divider visual structure.

    Header Divider is intentionally not a Section. The helper accepts a few
    common template implementations while keeping the check warning-only because
    visual separators can be designed in many ways.
    """
    lowered = template_html.lower()
    if "resume-header-divider" in lowered or "header-divider" in lowered:
        return True

    header_selectors = [".resume-header", "header", ".resume-header::after", ".resume-header:after"]
    for selector in header_selectors:
        for prop in ["border-bottom", "border-block-end", "box-shadow"]:
            value = _extract_css_property(template_html, selector, prop)
            if value and "none" not in value and "0" != value.strip():
                return True
        background = _extract_css_property(template_html, selector, "background")
        background_color = _extract_css_property(template_html, selector, "background-color")
        content = _extract_css_property(template_html, selector, "content")
        if (background or background_color) and selector.endswith(("::after", ":after")) and content is not None:
            return True

    return False


def _add_header_divider_warning(template_html: str, warnings: list[str]) -> None:
    if not _has_header_divider(template_html):
        warnings.append(
            "Header Divider not detected; templates should include a visual separator between "
            "Name/Contact/Photo header content and ordinary sections. This is a required "
            "template visual structure, not a Section. Recommended explicit form: "
            '<div class="resume-header-divider" aria-hidden="true"></div>.'
        )


def _add_heading_hierarchy_warnings(template_html: str, warnings: list[str]) -> None:
    selector_sizes = {
        '[data-section-type="name"]': _extract_css_font_size(template_html, '[data-section-type="name"]'),
        ".resume-section-content h1": _extract_css_font_size(template_html, ".resume-section-content h1"),
        ".resume-section-title": _extract_css_font_size(template_html, ".resume-section-title"),
        ".resume-section-content h2": _extract_css_font_size(template_html, ".resume-section-content h2"),
        ".resume-section-content h3": _extract_css_font_size(template_html, ".resume-section-content h3"),
        ".resume-section-content h4": _extract_css_font_size(template_html, ".resume-section-content h4"),
        ".resume-section-content h5": _extract_css_font_size(template_html, ".resume-section-content h5"),
        ".resume-section-content h6": _extract_css_font_size(template_html, ".resume-section-content h6"),
    }

    section_title_size = selector_sizes[".resume-section-title"]
    markdown_h2_size = selector_sizes[".resume-section-content h2"]
    if section_title_size and markdown_h2_size and section_title_size != markdown_h2_size:
        warnings.append(
            "Section title font-size should match Markdown h2: "
            f".resume-section-title={section_title_size}, .resume-section-content h2={markdown_h2_size}"
        )
    elif section_title_size and not markdown_h2_size:
        warnings.append("template should define .resume-section-content h2 font-size matching .resume-section-title")

    selector_pt_sizes = {selector: _parse_css_size_pt(size) for selector, size in selector_sizes.items()}
    base = selector_pt_sizes[".resume-section-title"]
    if base is None:
        warnings.append("template should define .resume-section-title font-size so heading relative scale can be checked")
        return

    ratio_drifts: list[str] = []
    for selector, expected_ratio in HEADING_SCALE_RATIOS.items():
        size_pt = selector_pt_sizes.get(selector)
        if size_pt is None:
            warnings.append(f"template should define {selector} font-size so heading relative scale can be checked")
            continue
        actual_ratio = size_pt / base
        if abs(actual_ratio - expected_ratio) > HEADING_SCALE_TOLERANCE:
            ratio_drifts.append(
                f"{selector} ratio {_format_ratio(actual_ratio)} (expected ~{_format_ratio(expected_ratio)})"
            )

    if ratio_drifts:
        warnings.append(
            "heading relative scale drifts from approved example ratios based on .resume-section-title: "
            + "; ".join(ratio_drifts)
        )


def evaluate_photo_layout(measurements: dict[str, Any]) -> dict[str, Any]:
    """Evaluate measured Photo Section geometry against current template guidance.

    Expected measurements are normally produced from browser computed geometry:
    - ratio: photo width / height, current approved example target is 0.75
    - topDiff: photo top - header content top, expected near 0px
    - rightDiff: photo right - header content right, expected near 0px
    - gapToDivider: divider top - photo bottom, expected positive and small
    """
    warnings: list[str] = []

    ratio = measurements.get("ratio")
    if isinstance(ratio, (int, float)):
        if abs(float(ratio) - PHOTO_LAYOUT_RATIO) > PHOTO_LAYOUT_TOLERANCE_RATIO:
            warnings.append(
                "Photo Section aspect ratio drifts from approved example: "
                f"ratio={float(ratio):.3f}, expected ~{PHOTO_LAYOUT_RATIO:.2f}."
            )
    else:
        warnings.append("Photo Section aspect ratio measurement missing: provide ratio=width/height.")

    top_diff = measurements.get("topDiff")
    if isinstance(top_diff, (int, float)):
        if abs(float(top_diff)) > PHOTO_LAYOUT_TOLERANCE_ALIGNMENT:
            warnings.append(
                "Photo Section top should align with header content top: "
                f"topDiff={float(top_diff):.3f}px, expected within ±{PHOTO_LAYOUT_TOLERANCE_ALIGNMENT}px."
            )
    else:
        warnings.append("Photo Section top alignment measurement missing: provide topDiff.")

    right_diff = measurements.get("rightDiff")
    if isinstance(right_diff, (int, float)):
        if abs(float(right_diff)) > PHOTO_LAYOUT_TOLERANCE_ALIGNMENT:
            warnings.append(
                "Photo Section right edge should align with header content right edge: "
                f"rightDiff={float(right_diff):.3f}px, expected within ±{PHOTO_LAYOUT_TOLERANCE_ALIGNMENT}px."
            )
    else:
        warnings.append("Photo Section right alignment measurement missing: provide rightDiff.")

    gap_to_divider = measurements.get("gapToDivider")
    if isinstance(gap_to_divider, (int, float)):
        gap = float(gap_to_divider)
        if gap < PHOTO_LAYOUT_MIN_GAP:
            warnings.append(
                "Photo Section gap to Header Divider should stay positive to avoid overlap: "
                f"gapToDivider={gap:.3f}px, expected >= {PHOTO_LAYOUT_MIN_GAP}px."
            )
        elif gap > PHOTO_LAYOUT_MAX_GAP:
            warnings.append(
                "Photo Section gap to Header Divider is too large; photo should be as large as possible "
                "within the existing header rhythm: "
                f"gapToDivider={gap:.3f}px, expected <= {PHOTO_LAYOUT_MAX_GAP}px."
            )
    else:
        warnings.append("Photo Section gap measurement missing: provide gapToDivider.")

    return {"ok": len(warnings) == 0, "warnings": warnings, "measurements": measurements}


def _load_json_file(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON file: {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError(f"JSON file must contain an object: {path}")
    return data


def fetch_schema(backend: str) -> dict[str, Any] | None:
    try:
        with urllib.request.urlopen(f"{backend.rstrip('/')}/api/section-schema", timeout=2) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def validate_template(template_html: str, schema: dict[str, Any] | None = None) -> dict[str, Any]:
    required_specials = ["name", "contact"]
    optional_specials = ["photo"]
    if schema:
        required_specials = [s["id"] for s in schema.get("special_sections", []) if s.get("required")]
        optional_specials = [s["id"] for s in schema.get("special_sections", []) if not s.get("required")]

    parser = AnchorParser()
    parser.feed(template_html)

    errors: list[str] = []
    warnings: list[str] = []
    anchors: dict[str, Any] = {}

    for sid in required_specials:
        count = parser.special_counts.get(sid, 0)
        anchors[sid] = count
        if count == 0:
            errors.append(f'missing required anchor: [data-section-type="{sid}"]')
        elif count > 1:
            warnings.append(f'multiple anchors found for special section: {sid} ({count})')

    for sid in optional_specials:
        anchors[sid] = parser.special_counts.get(sid, 0)

    main_slot_count = parser.slot_counts.get("main", 0)
    anchors["main_slot"] = main_slot_count
    if main_slot_count == 0:
        errors.append('missing main slot: [data-sections-slot="main"]')
    elif main_slot_count > 1:
        errors.append(f'multiple main slots found: {main_slot_count}')

    placeholders = sorted(set(re.findall(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}", template_html)))
    disallowed = [p for p in placeholders if p not in LEGACY_PLACEHOLDER_ALLOWLIST]
    if disallowed:
        warnings.append("legacy Mustache placeholders found; Section v2 templates should use anchors/slots: " + ", ".join(disallowed))

    for cls in ["resume-section", "resume-section-title", "resume-section-content"]:
        if cls not in template_html:
            warnings.append(f"template does not mention .{cls}; injected general sections may be unstyled")

    _add_header_divider_warning(template_html, warnings)
    _add_heading_hierarchy_warnings(template_html, warnings)

    return {
        "ok": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "anchors": anchors,
        "legacy_placeholders": placeholders,
        "schema_source": "backend" if schema else "fallback",
    }


def cmd_validate(args: argparse.Namespace) -> int:
    path = Path(args.template).expanduser()
    if not path.exists():
        print(json.dumps({"ok": False, "errors": [f"template not found: {path}"]}, ensure_ascii=False, indent=2))
        return 2

    schema = fetch_schema(args.backend)
    report = validate_template(path.read_text(encoding="utf-8"), schema=schema)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


def cmd_check_photo_layout(args: argparse.Namespace) -> int:
    path = Path(args.measurements).expanduser()
    if not path.exists():
        print(json.dumps({"ok": False, "warnings": [], "errors": [f"measurements not found: {path}"]}, ensure_ascii=False, indent=2))
        return 2
    try:
        measurements = _load_json_file(path)
    except ValueError as exc:
        print(json.dumps({"ok": False, "warnings": [], "errors": [str(exc)]}, ensure_ascii=False, indent=2))
        return 2

    report = evaluate_photo_layout(measurements)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="ResumeCopilot template helper")
    parser.add_argument("--backend", default=DEFAULT_BACKEND, help="ResumeCopilot backend URL")
    sub = parser.add_subparsers(dest="command", required=True)

    validate = sub.add_parser("validate", help="validate a template.html file")
    validate.add_argument("--template", required=True, help="path to template.html")
    validate.set_defaults(func=cmd_validate)

    check_photo_layout = sub.add_parser(
        "check-photo-layout",
        help="evaluate browser-measured Photo Section geometry JSON",
    )
    check_photo_layout.add_argument(
        "--measurements",
        required=True,
        help="path to JSON with ratio, topDiff, rightDiff, gapToDivider",
    )
    check_photo_layout.set_defaults(func=cmd_check_photo_layout)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
