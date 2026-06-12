#!/usr/bin/env python3
"""Tests for ResumeCopilot template helper."""

from __future__ import annotations

from resume_template import evaluate_photo_layout, validate_template


def assert_true(value: bool, message: str) -> None:
    if not value:
        raise AssertionError(message)


def assert_equal(actual, expected, message: str) -> None:
    if actual != expected:
        raise AssertionError(f"{message}: expected {expected!r}, got {actual!r}")


def scaled_heading_html(base_h2_size: str = "20pt") -> str:
    """Return CSS using the approved heading scale, scaled from h2."""
    base = float(base_h2_size.removesuffix("pt"))
    name = base * (34 / 14)
    h1 = base * (28 / 14)
    h3 = base * (12.5 / 14)
    h4 = base * (11.25 / 14)
    h5 = base * (10.5 / 14)
    h6 = base * (10 / 14)
    return f"""
    <style>
      .resume-header {{ border-bottom: 2px solid #1a5276; }}
      [data-section-type="name"] {{ font-size: {name:.3f}pt; letter-spacing: 7px; }}
      .resume-section-title {{ font-size: {base:.3f}pt; }}
      .resume-section-content h1 {{ font-size: {h1:.3f}pt; letter-spacing: 2px; }}
      .resume-section-content h2 {{ font-size: {base:.3f}pt; }}
      .resume-section-content h3 {{ font-size: {h3:.3f}pt; }}
      .resume-section-content h4 {{ font-size: {h4:.3f}pt; }}
      .resume-section-content h5 {{ font-size: {h5:.3f}pt; }}
      .resume-section-content h6 {{ font-size: {h6:.3f}pt; }}
    </style>
    <header class="resume-header">
      <h1 data-section-type="name"></h1>
      <div data-section-type="contact"></div>
    </header>
    <main data-sections-slot="main"></main>
    <section class="resume-section">
      <h2 class="resume-section-title"></h2>
      <div class="resume-section-content"></div>
    </section>
    """


def test_header_divider_warns_when_no_visual_separator_detected() -> None:
    html = scaled_heading_html("20pt").replace(
        ".resume-header { border-bottom: 2px solid #1a5276; }\n      ",
        "",
    )

    report = validate_template(html)

    assert_true(
        any("Header Divider" in warning for warning in report["warnings"]),
        "missing Header Divider warning",
    )


def test_header_divider_accepts_explicit_divider_element() -> None:
    html = scaled_heading_html("20pt").replace(
        ".resume-header { border-bottom: 2px solid #1a5276; }",
        ".resume-header-divider { width: 100%; height: 2px; background: #1a5276; }",
    ).replace(
        "</header>",
        "  <div class=\"resume-header-divider\" aria-hidden=\"true\"></div>\n    </header>",
    )

    report = validate_template(html)

    assert_equal(
        [warning for warning in report["warnings"] if "Header Divider" in warning],
        [],
        "explicit Header Divider element should not warn",
    )


def test_header_divider_accepts_resume_header_border_bottom() -> None:
    report = validate_template(scaled_heading_html("20pt"))

    assert_equal(
        [warning for warning in report["warnings"] if "Header Divider" in warning],
        [],
        "resume-header border-bottom should count as Header Divider",
    )


def test_heading_scale_accepts_approved_relative_ratios_at_different_absolute_size() -> None:
    report = validate_template(scaled_heading_html("20pt"))

    assert_true(report["ok"], "relative heading scale issues should be warning-only")
    assert_equal(
        [warning for warning in report["warnings"] if "heading relative scale" in warning],
        [],
        "approved ratios should not warn even when absolute sizes differ from examples",
    )


def test_heading_scale_warns_when_relative_ratio_drifts() -> None:
    html = """
    <style>
      [data-section-type="name"] { font-size: 20pt; letter-spacing: 2px; }
      .resume-section-title { font-size: 14pt; }
      .resume-section-content h1 { font-size: 16pt; letter-spacing: 2px; }
      .resume-section-content h2 { font-size: 12pt; }
      .resume-section-content h3 { font-size: 16pt; }
      .resume-section-content h4 { font-size: 14pt; }
      .resume-section-content h5 { font-size: 14pt; }
      .resume-section-content h6 { font-size: 14pt; }
    </style>
    <h1 data-section-type="name"></h1>
    <div data-section-type="contact"></div>
    <main data-sections-slot="main"></main>
    <section class="resume-section">
      <h2 class="resume-section-title"></h2>
      <div class="resume-section-content"></div>
    </section>
    """

    report = validate_template(html)

    assert_true(
        any("heading relative scale" in warning for warning in report["warnings"]),
        "missing relative scale drift warning",
    )


def test_heading_scale_accepts_current_example_ratio() -> None:
    html = """
    <style>
      [data-section-type="name"] { font-size: 34pt; letter-spacing: 7px; }
      .resume-section-title { font-size: 14pt; }
      .resume-section-content h1 { font-size: 28pt; letter-spacing: 2px; }
      .resume-section-content h2 { font-size: 14pt; }
      .resume-section-content h3 { font-size: 12.5pt; }
      .resume-section-content h4 { font-size: 11.25pt; }
      .resume-section-content h5 { font-size: 10.5pt; }
      .resume-section-content h6 { font-size: 10pt; }
    </style>
    <h1 data-section-type="name"></h1>
    <div data-section-type="contact"></div>
    <main data-sections-slot="main"></main>
    <section class="resume-section">
      <h2 class="resume-section-title"></h2>
      <div class="resume-section-content"></div>
    </section>
    """

    report = validate_template(html)

    assert_equal(
        [warning for warning in report["warnings"] if "heading relative scale" in warning or "font-size should match" in warning],
        [],
        "current example heading ratio should not warn",
    )


def test_photo_layout_accepts_example_ratio() -> None:
    result = evaluate_photo_layout({
        "ratio": 0.75, "topDiff": 0, "rightDiff": 0, "gapToDivider": 4.078
    })
    layout_warnings = [w for w in result["warnings"] if "Photo Section" in w]
    assert_equal(layout_warnings, [], "example photo layout should not warn")


def test_photo_layout_warns_when_ratio_drifts() -> None:
    result = evaluate_photo_layout({
        "ratio": 0.9, "topDiff": 0, "rightDiff": 0, "gapToDivider": 4.078
    })
    assert_true(
        any("Photo Section aspect ratio" in w for w in result["warnings"]),
        "missing aspect ratio drift warning",
    )


def test_photo_layout_warns_when_top_misaligned() -> None:
    result = evaluate_photo_layout({
        "ratio": 0.75, "topDiff": 10, "rightDiff": 0, "gapToDivider": 4.078
    })
    assert_true(
        any("Photo Section top" in w for w in result["warnings"]),
        "missing top alignment warning",
    )


def test_photo_layout_warns_when_right_misaligned() -> None:
    result = evaluate_photo_layout({
        "ratio": 0.75, "topDiff": 0, "rightDiff": 10, "gapToDivider": 4.078
    })
    assert_true(
        any("Photo Section right" in w for w in result["warnings"]),
        "missing right alignment warning",
    )


def test_photo_layout_warns_when_gap_negative() -> None:
    result = evaluate_photo_layout({
        "ratio": 0.75, "topDiff": 0, "rightDiff": 0, "gapToDivider": -3
    })
    assert_true(
        any("Photo Section gap" in w for w in result["warnings"]),
        "missing negative gap warning",
    )


def test_photo_layout_warns_when_gap_too_large() -> None:
    result = evaluate_photo_layout({
        "ratio": 0.75, "topDiff": 0, "rightDiff": 0, "gapToDivider": 20
    })
    assert_true(
        any("Photo Section gap" in w for w in result["warnings"]),
        "missing large gap warning",
    )


def test_photo_layout_returns_ok_true_when_no_warnings() -> None:
    result = evaluate_photo_layout({
        "ratio": 0.75, "topDiff": 0.5, "rightDiff": -1.2, "gapToDivider": 4.0
    })
    assert_true(result["ok"], "clean measurements should produce ok=True")


def test_photo_layout_returns_ok_false_when_warnings() -> None:
    result = evaluate_photo_layout({
        "ratio": 0.9, "topDiff": 10, "rightDiff": 10, "gapToDivider": -3
    })
    assert_true(not result["ok"], "bad measurements should produce ok=False")


def main() -> None:
    test_header_divider_warns_when_no_visual_separator_detected()
    test_header_divider_accepts_explicit_divider_element()
    test_header_divider_accepts_resume_header_border_bottom()
    test_heading_scale_accepts_approved_relative_ratios_at_different_absolute_size()
    test_heading_scale_warns_when_relative_ratio_drifts()
    test_heading_scale_accepts_current_example_ratio()
    test_photo_layout_accepts_example_ratio()
    test_photo_layout_warns_when_ratio_drifts()
    test_photo_layout_warns_when_top_misaligned()
    test_photo_layout_warns_when_right_misaligned()
    test_photo_layout_warns_when_gap_negative()
    test_photo_layout_warns_when_gap_too_large()
    test_photo_layout_returns_ok_true_when_no_warnings()
    test_photo_layout_returns_ok_false_when_warnings()
    print("resume_template tests passed: 14")


if __name__ == "__main__":
    main()
