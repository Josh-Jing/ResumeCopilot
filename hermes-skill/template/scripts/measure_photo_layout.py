#!/usr/bin/env python3
"""Measure Photo Section geometry from a template.html via Playwright.

Usage:
    cd /Users/jqf/Projects/ResumeCopilot
    uv run --project resume-web/backend python resume-skill/template/scripts/measure_photo_layout.py \
      --template examples/resumes/证件照简历/template.html \
      --output /tmp/photo-layout.json

Outputs JSON with {ratio, topDiff, rightDiff, gapToDivider}.
Pipe the JSON into resume_template.py check-photo-layout for evaluation.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def measure(template_path: str | Path) -> dict:
    template_path = Path(template_path).expanduser().resolve()

    try:
        from playwright.sync_api import sync_playwright  # type: ignore[import-untyped]
    except ImportError:
        return {
            "ok": False,
            "errors": [
                "playwright not installed. Run inside backend env: uv add --dev playwright && uv run python -m playwright install chromium"
            ],
        }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 800, "height": 1200})
        page.goto(template_path.as_uri())

        measurements = page.evaluate("""() => {
            const nameEl = document.querySelector('[data-section-type="name"]');
            const contactEl = document.querySelector('[data-section-type="contact"]');
            const photo = document.querySelector('[data-section-type="photo"]');
            const main = document.querySelector('[data-sections-slot="main"]');

            if (!photo) {
                return { ok: false, errors: ['no [data-section-type="photo"] found in template'] };
            }
            if (!nameEl || !contactEl || !main) {
                return { ok: false, errors: ['missing name/contact/main anchor; validate template first'] };
            }

            nameEl.textContent = '候选人姓名';
            contactEl.textContent = '电话: 13800000000 · 邮箱: zhangsan@example.com · 上海';
            photo.textContent = '证件照';
            main.innerHTML = `
                <section class="resume-section" data-section-id="sec_demo_1">
                    <h2 class="resume-section-title">教育背景</h2>
                    <div class="resume-section-content markdown-body"><p>某某大学 · 计算机科学</p></div>
                </section>
                <section class="resume-section" data-section-id="sec_demo_2">
                    <h2 class="resume-section-title">项目经历</h2>
                    <div class="resume-section-content markdown-body"><p>ResumeCopilot 项目 · 前后端协同开发</p></div>
                </section>
            `;

            // Force style/layout recalculation after content injection.
            document.body.offsetHeight;

            const pr = photo.getBoundingClientRect();
            const nr = nameEl.getBoundingClientRect();
            const firstTitle = document.querySelector('.resume-section-title');
            const sr = firstTitle ? firstTitle.getBoundingClientRect() : null;

            const header = photo.closest('.resume-header') || nameEl.parentElement;
            const headerStyle = header ? getComputedStyle(header) : null;
            const headerRect = header ? header.getBoundingClientRect() : null;
            const borderBottom = headerStyle ? parseFloat(headerStyle.borderBottomWidth || '0') : 0;
            const dividerTop = headerRect ? headerRect.bottom - borderBottom : null;

            return {
                ok: true,
                ratio: pr.width / pr.height,
                topDiff: pr.top - nr.top,
                rightDiff: sr ? pr.right - sr.right : null,
                gapToDivider: dividerTop !== null ? dividerTop - pr.bottom : null,
                photoWidth: pr.width,
                photoHeight: pr.height,
                photoTop: pr.top,
                photoBottom: pr.bottom,
                photoRight: pr.right,
                nameTop: nr.top,
                sectionTitleRight: sr ? sr.right : null,
                inferredDividerTop: dividerTop,
            };
        }""")

        browser.close()

    return measurements


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Measure Photo Section geometry from template HTML via Playwright"
    )
    parser.add_argument("--template", required=True, help="path to template.html")
    parser.add_argument("-o", "--output", default=None, help="write measurements JSON to this path")
    args = parser.parse_args()

    result = measure(args.template)
    output = json.dumps(result, ensure_ascii=False, indent=2)

    if args.output:
        Path(args.output).expanduser().write_text(output + "\n", encoding="utf-8")
    else:
        print(output)

    return 0 if result.get("ok", True) else 1


if __name__ == "__main__":
    sys.exit(main())