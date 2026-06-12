from resume_domain import (
    DomainError,
    create_general_section,
    default_content,
    delete_section,
    inspect_content,
    move_section,
    normalize_content,
    resolve_section_by_title,
    update_section,
    validate_content,
)


def assert_equal(actual, expected, label):
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")


def sample_content():
    return normalize_content({
        "version": 2,
        "sections": {
            "name": {"id": "name", "title": "姓名", "content": "候选人姓名"},
            "contact": {"id": "contact", "title": "联系方式", "content": "- 📱 138\n- 📧 a@example.com"},
            "sec_AAAAAAAA": {"id": "sec_AAAAAAAA", "title": "教育背景", "content": "## 某理工大学\n本科"},
            "sec_BBBBBBBB": {"id": "sec_BBBBBBBB", "title": "项目经历", "content": "## ResumeCopilot\n- 做了编辑器"},
            "sec_CCCCCCCC": {"id": "sec_CCCCCCCC", "title": "专业技能", "content": "Python"},
        },
        "section_order": ["sec_AAAAAAAA", "sec_BBBBBBBB", "sec_CCCCCCCC"],
    })


def test_validate_content_detects_invalid_shape():
    report = validate_content({
        "version": 2,
        "sections": {
            "name": {"id": "name", "title": "姓名", "content": "候选人姓名"},
            "sec_bad": {"id": "sec_bad", "title": "坏块", "content": "", "type": "general"},
        },
        "section_order": ["name", "sec_missing", "sec_bad"],
    })

    assert_equal(report["ok"], False, "invalid content is rejected")
    joined = "\n".join(report["errors"] + report["warnings"])
    assert "missing required special section: contact" in joined
    assert "section_order contains special section id: name" in joined
    assert "section_order references missing section: sec_missing" in joined
    assert "general section sec_bad has forbidden field: type" in joined
    assert "general section id does not match ^sec_[A-Za-z0-9]{8}$: sec_bad" in joined


def test_inspect_content_returns_agent_friendly_summary():
    summary = inspect_content(sample_content(), name="通用技术简历")

    assert_equal(summary["name"], "通用技术简历", "resume name")
    assert_equal(summary["section_order"], ["sec_AAAAAAAA", "sec_BBBBBBBB", "sec_CCCCCCCC"], "order")
    assert_equal(summary["sections"][0]["id"], "name", "name first")
    assert_equal(summary["sections"][0]["kind"], "special", "name kind")
    assert_equal(summary["sections"][1]["preview"], "📱 138 · 📧 a@example.com", "contact preview")
    assert_equal(summary["sections"][2]["kind"], "general", "general kind")
    assert summary["sections"][2]["content_chars"] > 0


def test_resolve_section_by_title_handles_unique_missing_and_ambiguous():
    content = sample_content()
    assert_equal(resolve_section_by_title(content, "项目经历")["status"], "unique", "unique title")
    assert_equal(resolve_section_by_title(content, "不存在")["status"], "not_found", "missing title")

    content["sections"]["sec_DDDDDDDD"] = {"id": "sec_DDDDDDDD", "title": "项目经历", "content": "duplicate"}
    content["section_order"].append("sec_DDDDDDDD")
    ambiguous = resolve_section_by_title(content, "项目经历")
    assert_equal(ambiguous["status"], "ambiguous", "ambiguous title")
    assert_equal(len(ambiguous["matches"]), 2, "ambiguous match count")


def test_create_update_delete_move_general_sections_are_safe():
    content = sample_content()

    created, section = create_general_section(
        content,
        title="科研经历",
        content_md="## 论文\n- A",
        anchor_section_id="sec_AAAAAAAA",
        where="after",
        id_factory=lambda existing: "sec_DDDDDDDD",
    )
    assert_equal(section["id"], "sec_DDDDDDDD", "generated id")
    assert_equal(
        created["section_order"],
        ["sec_AAAAAAAA", "sec_DDDDDDDD", "sec_BBBBBBBB", "sec_CCCCCCCC"],
        "created order",
    )

    updated = update_section(created, "sec_DDDDDDDD", title="研究经历")
    assert_equal(updated["sections"]["sec_DDDDDDDD"]["title"], "研究经历", "title updated")

    updated = update_section(updated, "contact", content_md="- 📱 139")
    assert_equal(updated["sections"]["contact"]["content"], "- 📱 139", "special content updated")

    try:
        update_section(updated, "contact", title="新标题")
    except DomainError as exc:
        assert "special section title is not editable" in str(exc)
    else:
        raise AssertionError("special section title update should fail")

    moved = move_section(updated, "sec_CCCCCCCC", anchor_section_id="sec_AAAAAAAA", where="before")
    assert_equal(
        moved["section_order"],
        ["sec_CCCCCCCC", "sec_AAAAAAAA", "sec_DDDDDDDD", "sec_BBBBBBBB"],
        "moved order",
    )

    deleted = delete_section(moved, "sec_DDDDDDDD")
    assert "sec_DDDDDDDD" not in deleted["sections"]
    assert "sec_DDDDDDDD" not in deleted["section_order"]

    try:
        delete_section(deleted, "name")
    except DomainError as exc:
        assert "special section cannot be deleted" in str(exc)
    else:
        raise AssertionError("special section delete should fail")


def test_default_content_is_valid():
    report = validate_content(default_content())
    assert_equal(report["ok"], True, "default content valid")


if __name__ == "__main__":
    tests = [
        test_validate_content_detects_invalid_shape,
        test_inspect_content_returns_agent_friendly_summary,
        test_resolve_section_by_title_handles_unique_missing_and_ambiguous,
        test_create_update_delete_move_general_sections_are_safe,
        test_default_content_is_valid,
    ]
    for test in tests:
        test()
    print(f"resume_domain tests passed: {len(tests)}")
