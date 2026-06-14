"""Tests for inner fenced-block rendering."""
from __future__ import annotations

from inner_block import parse_inner_block, parse_inner_line, render_inner_block_html, resolve_inner_column_widths
from resume_pdf import render_markdown


def test_parse_inner_line() -> None:
    left = parse_inner_line("- [50%] [[ ### 东北大学")
    assert left is not None
    assert left.width_pct == 50
    assert left.align == "left"
    assert left.body == "### 东北大学"

    center = parse_inner_line("- 本科")
    assert center is not None
    assert center.width_pct is None
    assert center.align == "center"
    assert center.body == "本科"

    right = parse_inner_line("- [25%] ]] 2020.09 – 2024.07")
    assert right is not None
    assert right.width_pct == 25
    assert right.align == "right"
    assert right.body == "2020.09 – 2024.07"


def test_resolve_widths_for_education_example() -> None:
    source = """- [50%] [[ ### 东北大学
- 本科
- 计算机科学与技术
- 2020.09 – 2024.07
- 专业排名前25%"""
    columns = parse_inner_block(source)
    assert len(columns) == 5
    widths = resolve_inner_column_widths(columns)
    assert widths == [50, 12.5, 12.5, 12.5, 12.5]


def test_render_inner_block_html() -> None:
    html = render_inner_block_html(
        "- [50%] [[ ### 东北大学\n- 本科",
        lambda body: f"<h3>{body[4:]}</h3>" if body.startswith("### ") else f"<p>{body}</p>",
    )
    assert 'class="inner-row"' in html
    assert "inner-col--left" in html
    assert "grid-template-columns: 50fr 50fr" in html
    assert "<h3>东北大学</h3>" in html
    assert "<p>本科</p>" in html


def test_render_markdown_inner_fence() -> None:
    markdown = """```inner
- [[ ### 某理工大学
- ]] 本科 · 软件工程 · 2021.09 – 2025.06
```

- GPA：3.72 / 4.00"""
    html = render_markdown(markdown)
    assert 'class="inner-row"' in html
    assert "<h3>某理工大学</h3>" in html
    assert "本科 · 软件工程 · 2021.09 – 2025.06" in html
    assert "<ul>" in html
    assert "GPA" in html
    assert "<pre>" not in html


def main() -> None:
    test_parse_inner_line()
    test_resolve_widths_for_education_example()
    test_render_inner_block_html()
    test_render_markdown_inner_fence()
    print("inner_block tests passed: 4")


if __name__ == "__main__":
    main()
