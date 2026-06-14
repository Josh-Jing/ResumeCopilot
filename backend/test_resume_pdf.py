from resume_pdf import TYPOGRAPHY_CSS, _inject_typography_css, build_print_html


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


def main() -> None:
    test_inject_typography_css_is_idempotent()
    test_build_print_html_includes_typography_css()
    print("resume_pdf tests passed: 2")


if __name__ == "__main__":
    main()
