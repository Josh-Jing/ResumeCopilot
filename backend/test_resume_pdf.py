from resume_pdf import (
    TYPOGRAPHY_CSS,
    _inject_fit_mode_style,
    _inject_typography_css,
    build_print_html,
    compute_fit_mode,
)


def test_inject_typography_css_is_idempotent() -> None:
    html = "<html><head></head><body></body></html>"
    once = _inject_typography_css(html)
    twice = _inject_typography_css(once)
    assert twice.count("resume-copilot-typography-css") == 1
    assert "text-justify: inter-ideograph" in twice


def test_build_print_html_includes_typography_css() -> None:
    template = '<html><head></head><body><main data-sections-slot="main"></main></body></html>'
    content = {
        "sections": {
            "name": {"id": "name", "title": "姓名", "content": "测试"},
            "contact": {"id": "contact", "title": "联系方式", "content": "- a@b.com"},
        },
        "section_order": [],
    }
    html = build_print_html(template, content)
    assert "resume-copilot-typography-css" in html
    assert "text-align: justify" in html


def test_compute_fit_mode_matches_preview_thresholds() -> None:
    assert compute_fit_mode(1123 * 0.5) == "natural"
    assert compute_fit_mode(1123 * 0.75) == "expand"
    assert compute_fit_mode(1123) == "natural"
    assert compute_fit_mode(1123 * 1.1) == "compact"
    assert compute_fit_mode(1123 * 1.31) == "overflow"


def test_fit_mode_style_injection_is_manual() -> None:
    html = '<html><head></head><body></body></html>'
    natural = _inject_fit_mode_style(html, None)
    compact = _inject_fit_mode_style(html, "compact")
    assert natural == html
    assert 'data-fit-mode="compact"' in compact
    assert "--fit-rhythm-scale" in compact


def test_build_print_html_includes_fit_mode_when_requested() -> None:
    template = '<html><head></head><body><main data-sections-slot="main"></main></body></html>'
    content = {"sections": {}, "section_order": []}
    html = build_print_html(template, content, fit_mode="compact")
    assert 'data-fit-mode="compact"' in html


def main() -> None:
    test_inject_typography_css_is_idempotent()
    test_build_print_html_includes_typography_css()
    test_compute_fit_mode_matches_preview_thresholds()
    test_fit_mode_style_injection_is_manual()
    test_build_print_html_includes_fit_mode_when_requested()
    print("resume_pdf tests passed: 5")


if __name__ == "__main__":
    main()
