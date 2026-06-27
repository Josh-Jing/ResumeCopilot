"""PDF/print rendering helpers for ResumeCopilot.

This module mirrors the frontend Section v2 rendering rules closely enough for
server-side PDF export: special sections are injected into data-section-type
anchors, ordinary sections are rendered into data-sections-slot="main".
"""
from __future__ import annotations

import html
import re
from typing import Match
from urllib.parse import quote

from resume_domain import SPECIAL_SECTION_IDS
from inner_block import render_inner_block_html

A4_HEIGHT = 1123
FILL_THRESHOLD = 0.75
MAX_AUTO_FIT_RATIO = 1.3
VALID_FIT_MODES = {"natural", "expand", "compact", "overflow"}


def compute_fit_mode(natural_height: int | float) -> str:
    ratio = natural_height / A4_HEIGHT
    if ratio < FILL_THRESHOLD:
        return "natural"
    if ratio < 1.0:
        return "expand"
    if ratio == 1.0:
        return "natural"
    if ratio <= MAX_AUTO_FIT_RATIO:
        return "compact"
    return "overflow"

TYPOGRAPHY_CSS = """
<style id="resume-copilot-typography-css">
  .resume-section-content > p,
  .resume-section-content > ul > li,
  .resume-section-content > ol > li {
    text-align: justify;
    text-justify: inter-ideograph;
  }
</style>
"""

PRINT_CSS = """
<style id="resume-copilot-print-css">
  @page { size: A4; margin: 0; }
  html, body { width: 794px; min-height: 1123px; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
"""


def parse_contact_inline(markdown: str) -> list[str]:
    return [
        re.sub(r"^\s*[-*]\s*", "", line).strip()
        for line in markdown.splitlines()
        if line.strip()
    ]


def render_markdown(markdown: str) -> str:
    """Small Markdown subset renderer for resume content.

    Supports headings, unordered lists, paragraphs, strong/code spans, line
    breaks, and ```inner fenced inline-column blocks. HTML is escaped first.
    """
    inner_fence = re.compile(r"```inner\n(.*?)```", re.DOTALL)
    parts: list[str] = []
    last = 0
    for match in inner_fence.finditer(markdown):
        if match.start() > last:
            parts.append(_render_markdown_blocks(markdown[last:match.start()]))
        parts.append(render_inner_block_html(match.group(1), _render_markdown_blocks))
        last = match.end()
    if last < len(markdown):
        parts.append(_render_markdown_blocks(markdown[last:]))
    return "\n".join(part for part in parts if part)


def _render_markdown_blocks(markdown: str) -> str:
    """Render ordinary markdown blocks outside fenced inner sections."""
    blocks: list[str] = []
    list_items: list[str] = []
    paragraph: list[str] = []

    def inline(text: str) -> str:
        escaped = html.escape(text, quote=True)
        escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
        escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
        escaped = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", escaped)
        escaped = re.sub(r"_([^_]+)_", r"<em>\1</em>", escaped)
        return escaped

    def flush_list() -> None:
        nonlocal list_items
        if list_items:
            blocks.append("<ul>" + "".join(f"<li>{item}</li>" for item in list_items) + "</ul>")
            list_items = []

    def flush_paragraph() -> None:
        nonlocal paragraph
        if paragraph:
            blocks.append("<p>" + "<br>".join(paragraph) + "</p>")
            paragraph = []

    for raw_line in markdown.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped:
            flush_list()
            flush_paragraph()
            continue

        if stripped.startswith("# "):
            flush_list()
            flush_paragraph()
            blocks.append(f"<h1>{inline(stripped[2:].strip())}</h1>")
        elif stripped.startswith("##### "):
            flush_list()
            flush_paragraph()
            blocks.append(f"<h5>{inline(stripped[6:].strip())}</h5>")
        elif stripped.startswith("#### "):
            flush_list()
            flush_paragraph()
            blocks.append(f"<h4>{inline(stripped[5:].strip())}</h4>")
        elif stripped.startswith("### "):
            flush_list()
            flush_paragraph()
            blocks.append(f"<h3>{inline(stripped[4:].strip())}</h3>")
        elif stripped.startswith("## "):
            flush_list()
            flush_paragraph()
            blocks.append(f"<h2>{inline(stripped[3:].strip())}</h2>")
        elif stripped.startswith("###### "):
            flush_list()
            flush_paragraph()
            blocks.append(f"<h6>{inline(stripped[7:].strip())}</h6>")
        elif re.match(r"^[-*]\s+", stripped):
            flush_paragraph()
            list_items.append(inline(re.sub(r"^[-*]\s+", "", stripped)))
        else:
            flush_list()
            paragraph.append(inline(stripped))

    flush_list()
    flush_paragraph()
    return "\n".join(blocks)


def _extract_markdown_image_source(markdown: str) -> str | None:
    match = re.match(r"^!\[[^\]]*\]\(([^)]+)\)$", markdown.strip())
    return match.group(1).strip() if match else None


def _is_safe_image_source(src: str) -> bool:
    return bool(
        re.match(r"^data:image/(png|jpeg|jpg|webp|gif);base64,", src, re.I)
        or re.match(r"^https?://", src, re.I)
    )


def render_special_section_content(section_type: str, content: str) -> str:
    if section_type == "name":
        return html.escape(content or "", quote=True)
    if section_type == "contact":
        return html.escape(" · ".join(parse_contact_inline(content or "")), quote=True)
    if section_type == "photo":
        raw = (content or "").strip()
        if not raw:
            return "证件照"
        image_src = _extract_markdown_image_source(raw) or raw
        if _is_safe_image_source(image_src):
            return f'<img src="{html.escape(image_src, quote=True)}" alt="证件照" />'
        return html.escape(raw, quote=True)
    return render_markdown(content or "")


def _replace_element_inner_by_attr(template_html: str, attr: str, value: str, inner_html: str) -> str:
    pattern = re.compile(
        rf"(<(?P<tag>[a-zA-Z][\w:-]*)(?P<attrs>[^>]*\s{re.escape(attr)}=[\"']{re.escape(value)}[\"'][^>]*)>)(?P<inner>.*?)(</(?P=tag)>)",
        re.S,
    )

    def repl(match: Match[str]) -> str:
        return match.group(1) + inner_html + match.group(5)

    return pattern.sub(repl, template_html, count=1)


def _render_general_section(section: dict) -> str:
    section_id = html.escape(section.get("id", ""), quote=True)
    title = html.escape(section.get("title", ""), quote=True)
    content_html = render_markdown(section.get("content", ""))
    return (
        f'<section class="resume-section" data-section-id="{section_id}">\n'
        f'  <h2 class="resume-section-title">{title}</h2>\n'
        f'  <div class="resume-section-content markdown-body">\n{content_html}\n  </div>\n'
        f'</section>'
    )


def _inject_typography_css(document_html: str) -> str:
    if "resume-copilot-typography-css" in document_html:
        return document_html
    if "</head>" in document_html:
        return document_html.replace("</head>", TYPOGRAPHY_CSS + "</head>", 1)
    return TYPOGRAPHY_CSS + document_html


def _inject_print_css(document_html: str) -> str:
    if "resume-copilot-print-css" in document_html:
        return document_html
    if "</head>" in document_html:
        return document_html.replace("</head>", PRINT_CSS + "</head>", 1)
    return PRINT_CSS + document_html


def _fit_mode_style(mode: str | None) -> str:
    if mode == "expand":
        return '<style data-fit-mode="expand">\nhtml { --fit-rhythm-scale: 1.06; --fit-line-scale: 1.03; }\n</style>\n'
    if mode == "compact":
        return '<style data-fit-mode="compact">\nhtml { --fit-rhythm-scale: 0.65; --fit-line-scale: 0.88; --fit-font-scale: 0.94; }\n</style>\n'
    if mode == "overflow":
        return '<style data-fit-mode="overflow">\nhtml { /* no adjustments */ }\n</style>\n'
    return ""


def _inject_fit_mode_style(document_html: str, mode: str | None) -> str:
    style = _fit_mode_style(mode)
    if not style:
        return document_html
    if "</head>" in document_html:
        return document_html.replace("</head>", style + "</head>", 1)
    return style + document_html


def build_print_html(template_html: str, content: dict, *, fit_mode: str | None = None) -> str:
    """Return complete print-oriented HTML for PDF export."""
    result = template_html

    # Strip existing <!doctype> and <html>/<head>/<body> outer tags if template already has them
    # We only need to add doctype once, and preserve the template's structure intact.
    # This fixes the issue where :root CSS variables declared inside template don't work
    # because double <html> tags cause :root to match the outer injected html.
    result = re.sub(r'^\s*<!doctype[^>]*>\s*', '', result, flags=re.I)
    result = re.sub(r'^\s*<html[^>]*>\s*', '', result, flags=re.I)
    result = re.sub(r'\s*</html>\s*$', '', result, flags=re.I)

    sections = content.get("sections", {})
    for section_id in ("name", "contact", "photo"):
        section = sections.get(section_id)
        if not section:
            continue
        result = _replace_element_inner_by_attr(
            result,
            "data-section-type",
            section_id,
            render_special_section_content(section_id, section.get("content", "")),
        )

    general_html = []
    for section_id in content.get("section_order", []):
        if section_id in SPECIAL_SECTION_IDS:
            continue
        section = sections.get(section_id)
        if section:
            general_html.append(_render_general_section(section))

    result = _replace_element_inner_by_attr(result, "data-sections-slot", "main", "\n".join(general_html))
    result = _inject_fit_mode_style(result, fit_mode)
    result = _inject_typography_css(result)
    result = _inject_print_css(result)
    if not result.lstrip().lower().startswith(("<!doctype", "<html")):
        result = "<!doctype html>\n" + result
    return result


def build_content_disposition(resume_name: str) -> str:
    """Return a latin-1-safe Content-Disposition header for PDF download."""
    filename = f"{resume_name}.pdf"
    return f'attachment; filename="resume.pdf"; filename*=UTF-8\'\'{quote(filename)}'


async def render_pdf_bytes(html_content: str) -> bytes:
    """Render HTML to a single A4 PDF using Playwright Chromium."""
    try:
        from playwright.async_api import async_playwright
    except Exception as exc:  # pragma: no cover - environment dependent
        raise RuntimeError("Playwright is not installed. Run: uv add playwright && uv run playwright install chromium") from exc

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 794, "height": 1123}, device_scale_factor=1)
        await page.set_content(html_content, wait_until="networkidle")
        pdf = await page.pdf(
            format="A4",
            print_background=True,
            prefer_css_page_size=True,
            margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
        )
        await browser.close()
        return pdf
