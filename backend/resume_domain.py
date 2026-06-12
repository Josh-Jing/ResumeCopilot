"""ResumeCopilot domain logic — pure functions for Section v2 content operations.

All functions operate on plain dicts representing the normalized content model.
No file I/O. No HTTP. Testable without FastAPI or TestClient.
"""

from __future__ import annotations

import re
import secrets
import string

# ── Constants ───────────────────────────────────────────────────────────

SPECIAL_SECTION_IDS = frozenset({"name", "contact", "photo"})
SPECIAL_TITLE_LOCK = frozenset({"name", "contact", "photo"})
REQUIRED_SPECIAL_IDS = frozenset({"name", "contact"})
GENERAL_ID_PATTERN = re.compile(r"^sec_[A-Za-z0-9]{8}$")
ID_ALPHABET = string.ascii_letters + string.digits


class DomainError(Exception):
    """Raised when an operation violates domain rules."""


# ── Exceptions ──────────────────────────────────────────────────────────

class SectionNotFoundError(DomainError):
    def __init__(self, section_id: str) -> None:
        super().__init__(f"section not found: {section_id}")


class SectionNotGeneralError(DomainError):
    def __init__(self, section_id: str) -> None:
        super().__init__(f"section is not a general section: {section_id}")


class SpecialTitleLockedError(DomainError):
    def __init__(self, section_id: str) -> None:
        super().__init__(f"special section title is not editable: {section_id}")


class SpecialDeleteForbiddenError(DomainError):
    def __init__(self, section_id: str) -> None:
        super().__init__(f"special section cannot be deleted: {section_id}")


class AnchorNotFoundError(DomainError):
    def __init__(self, section_id: str) -> None:
        super().__init__(f"anchor section not found: {section_id}")


# ── Helpers ─────────────────────────────────────────────────────────────

def _default_id_factory(existing: dict[str, object]) -> str:
    while True:
        candidate = "sec_" + "".join(secrets.choice(ID_ALPHABET) for _ in range(8))
        if candidate not in existing:
            return candidate


# ── Functions ───────────────────────────────────────────────────────────

def get_section_schema() -> dict:
    """Return the dynamic Section v2 schema consumed by Skills/tools."""
    return {
        "app": "ResumeCopilot",
        "content_version": 2,
        "storage_root": "~/.resume-copilot/resumes",
        "special_sections": [
            {
                "id": "name",
                "required": True,
                "title": "姓名",
                "title_editable": False,
                "content_kind": "plain_text",
                "template_anchor": '[data-section-type="name"]',
            },
            {
                "id": "contact",
                "required": True,
                "title": "联系方式",
                "title_editable": False,
                "content_kind": "markdown_list_to_inline",
                "template_anchor": '[data-section-type="contact"]',
                "separator": " · ",
            },
            {
                "id": "photo",
                "required": False,
                "title": "证件照",
                "title_editable": False,
                "content_kind": "image_or_text",
                "template_anchor": '[data-section-type="photo"]',
                "accepted_sources": ["data:image/*", "http(s)", "markdown_image"],
            },
        ],
        "general_section": {
            "id_pattern": r"^sec_[A-Za-z0-9]{8}$",
            "order_field": "section_order",
            "template_slot": '[data-sections-slot="main"]',
            "dom": {
                "wrapper_class": "resume-section",
                "title_class": "resume-section-title",
                "content_class": "resume-section-content markdown-body",
            },
        },
        "rules": [
            "section_order only contains general section ids",
            "general sections do not store type",
            "special section positions are controlled by template anchors",
        ],
    }


def default_content() -> dict:
    """Return a fresh, valid default content dict."""
    return {
        "version": 2,
        "sections": {
            "name": {"id": "name", "title": "姓名", "content": "姓名"},
            "contact": {
                "id": "contact",
                "title": "联系方式",
                "content": "- 📱 \n- 📧 \n- 📍 ",
            },
        },
        "section_order": [],
    }


def normalize_content(raw: object) -> dict:
    """Normalize arbitrary input into a valid Section v2 content dict.

    Fills in missing required special sections and deduplicates section_order.
    """
    data = raw if isinstance(raw, dict) else {}

    raw_sections = data.get("sections") if isinstance(data, dict) else None
    sections: dict[str, dict] = {}
    if isinstance(raw_sections, dict):
        for section_id, value in raw_sections.items():
            if not isinstance(section_id, str):
                continue
            raw = value if isinstance(value, dict) else {}
            sections[section_id] = {
                "id": section_id,
                "title": (
                    raw["title"]
                    if isinstance(raw.get("title"), str) and raw["title"].strip()
                    else section_id
                ),
                "content": raw.get("content") if isinstance(raw.get("content"), str) else "",
            }

    # Ensure required special sections
    defaults = default_content()["sections"]
    for sid in REQUIRED_SPECIAL_IDS:
        sections.setdefault(sid, defaults[sid])

    # Build section_order: deduplicate, skip specials, skip missing
    seen: set[str] = set()
    order: list[str] = []
    raw_order = data.get("section_order") if isinstance(data, dict) else None
    if isinstance(raw_order, list):
        for sid in raw_order:
            if (
                isinstance(sid, str)
                and sid not in seen
                and sid not in SPECIAL_SECTION_IDS
                and sid in sections
            ):
                order.append(sid)
                seen.add(sid)

    # Append orphaned general sections
    for sid in sections:
        if sid not in SPECIAL_SECTION_IDS and sid not in seen:
            order.append(sid)
            seen.add(sid)

    return {"version": 2, "sections": sections, "section_order": order}


def validate_content(content: dict) -> dict:
    """Validate a normalized content dict and return a report.

    Returns:
        {"ok": bool, "errors": list[str], "warnings": list[str]}
    """
    errors: list[str] = []
    warnings: list[str] = []

    sections = content.get("sections", {})
    order = content.get("section_order", [])

    # Version must be 2
    if content.get("version") != 2:
        errors.append(f"version must be 2, got {content.get('version')}")

    # Required special sections
    for sid in REQUIRED_SPECIAL_IDS:
        if sid not in sections:
            errors.append(f"missing required special section: {sid}")

    # section_order must not contain special section ids
    for sid in order:
        if sid in SPECIAL_SECTION_IDS:
            errors.append(f"section_order contains special section id: {sid}")

    # section_order must not reference missing sections
    for sid in order:
        if sid not in sections:
            errors.append(f"section_order references missing section: {sid}")

    # Check all general sections
    for sid, section in sections.items():
        if sid in SPECIAL_SECTION_IDS:
            continue

        # Forbidden field: type
        if "type" in section:
            errors.append(f"general section {sid} has forbidden field: type")

        # ID pattern
        if not GENERAL_ID_PATTERN.match(sid):
            warnings.append(
                f"general section id does not match ^sec_[A-Za-z0-9]{{8}}$: {sid}"
            )

    return {
        "ok": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
    }


def inspect_content(content: dict, name: str = "") -> dict:
    """Produce an agent-friendly summary of a resume's content.

    Returns a dict with name, sections (id/kind/title/content_chars/preview),
    and section_order.
    """
    sections = content.get("sections", {})
    order = content.get("section_order", [])

    summary_sections = []
    # Always show special sections first
    for sid in ("name", "contact", "photo"):
        s = sections.get(sid)
        if s is None:
            continue
        kind = "special"
        content_str = s.get("content", "")
        preview = content_str[:120]
        if sid == "contact":
            items = [
                l.lstrip("-* ").strip()
                for l in content_str.split("\n")
                if l.strip()
            ]
            preview = " · ".join(items) if items else content_str
        summary_sections.append({
            "id": sid,
            "kind": kind,
            "title": s.get("title", ""),
            "content_chars": len(content_str),
            "preview": preview[:120],
        })

    # Then general sections in order
    for sid in order:
        s = sections.get(sid)
        if s is None:
            continue
        content_str = s.get("content", "")
        summary_sections.append({
            "id": sid,
            "kind": "general",
            "title": s.get("title", ""),
            "content_chars": len(content_str),
            "preview": content_str[:120],
        })

    return {
        "name": name,
        "sections": summary_sections,
        "section_order": list(order),
    }


def resolve_section_by_title(content: dict, title: str) -> dict:
    """Find a general section by title.

    Returns:
        {"status": "unique", "section": ...}
        {"status": "not_found", "message": ...}
        {"status": "ambiguous", "matches": [...]}
    """
    sections = content.get("sections", {})
    matches = [
        {"id": sid, "title": s.get("title", "")}
        for sid, s in sections.items()
        if sid not in SPECIAL_SECTION_IDS and s.get("title") == title
    ]

    if len(matches) == 0:
        return {"status": "not_found", "message": f"no section with title: {title}"}
    if len(matches) == 1:
        return {"status": "unique", "section": matches[0]}
    return {"status": "ambiguous", "matches": matches, "message": f"multiple sections with title: {title}"}


def create_general_section(
    content: dict,
    *,
    title: str = "新建 Section",
    content_md: str = "",
    anchor_section_id: str | None = None,
    where: str = "after",
    id_factory=None,
) -> tuple[dict, dict]:
    """Create a new general section and insert it into section_order.

    Returns (new_content, new_section_dict).
    """
    sections = content.get("sections", {})
    order = list(content.get("section_order", []))

    factory = id_factory or _default_id_factory
    new_id = factory(sections)
    new_section: dict = {
        "id": new_id,
        "title": title,
        "content": content_md,
    }
    sections = dict(sections)
    sections[new_id] = new_section

    # Build new order
    if anchor_section_id is None:
        order = list(order) + [new_id]
    elif anchor_section_id in SPECIAL_SECTION_IDS:
        # Anchor is special: insert at start (before) or end (after)
        if where == "before":
            order = [new_id] + order
        else:
            order = order + [new_id]
    elif anchor_section_id in order:
        idx = order.index(anchor_section_id)
        insert_at = idx + 1 if where == "after" else idx
        order = order[:insert_at] + [new_id] + order[insert_at:]
    else:
        order = list(order) + [new_id]

    new_content: dict = {
        "version": 2,
        "sections": sections,
        "section_order": order,
    }
    return new_content, new_section


def update_section(content: dict, section_id: str, *, title: str | None = None, content_md: str | None = None) -> dict:
    """Update a section's title and/or content.

    Returns new content dict. Raises DomainError for invalid operations.
    """
    if section_id not in content.get("sections", {}):
        raise SectionNotFoundError(section_id)

    sections = dict(content["sections"])
    section = dict(sections[section_id])

    if title is not None:
        if section_id in SPECIAL_TITLE_LOCK:
            raise SpecialTitleLockedError(section_id)
        section["title"] = title

    if content_md is not None:
        section["content"] = content_md

    sections[section_id] = section
    return {**content, "sections": sections}


def delete_section(content: dict, section_id: str) -> dict:
    """Delete a general section from sections and section_order.

    Returns new content dict. Raises DomainError if section is special.
    """
    if section_id in SPECIAL_SECTION_IDS:
        raise SpecialDeleteForbiddenError(section_id)

    if section_id not in content.get("sections", {}):
        raise SectionNotFoundError(section_id)

    sections = dict(content["sections"])
    del sections[section_id]

    order = [sid for sid in content.get("section_order", []) if sid != section_id]

    return {"version": 2, "sections": sections, "section_order": order}


def move_section(
    content: dict,
    section_id: str,
    *,
    anchor_section_id: str,
    where: str = "after",
) -> dict:
    """Move a general section before or after an anchor general section.

    Returns new content dict.
    """
    sections = content.get("sections", {})
    order = list(content.get("section_order", []))

    if section_id not in sections or section_id in SPECIAL_SECTION_IDS:
        raise SectionNotGeneralError(section_id)

    if anchor_section_id not in sections or anchor_section_id in SPECIAL_SECTION_IDS:
        raise SectionNotFoundError(anchor_section_id)

    if anchor_section_id not in order:
        raise AnchorNotFoundError(anchor_section_id)

    if section_id not in order:
        raise SectionNotFoundError(section_id)

    if section_id == anchor_section_id:
        return content

    # Remove from current position
    order = [sid for sid in order if sid != section_id]
    # Insert at anchor position
    idx = order.index(anchor_section_id)
    insert_at = idx + 1 if where == "after" else idx
    order = order[:insert_at] + [section_id] + order[insert_at:]

    return {**content, "section_order": order}