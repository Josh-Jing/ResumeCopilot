---
name: resume-copilot-template
description: Generate and validate ResumeCopilot Section v2 HTML templates. Template work stays creative; helpers only validate anchors/slots and schema compatibility.
platforms: [macos, linux, windows]
---

# ResumeCopilot Template Skill

Use this skill when designing, reviewing, or modifying `template.html` for ResumeCopilot.

ResumeCopilot is a human + Hermes resume editor:

```text
React/Vite frontend :5173  <->  FastAPI backend :8901  <->  ~/.resume-copilot/resumes/<name>/
```

This skill is for **template generation only**. Template design is partly visual/artistic, so do not constrain it with complex edit APIs. Use the backend only for dynamic schema lookup and use this skill's validator helper to check whether the generated HTML can work with the app.

## Current model: Section v2

`content.json` owns resume content and section order. `template.html` owns page layout and CSS.

Templates should NOT hard-code ordinary sections such as `education`, `projects`, or `skills` with Mustache placeholders. Ordinary sections are injected by the renderer into the main slot.

Required template anchors:

```html
<h1 data-section-type="name"></h1>
<div data-section-type="contact"></div>
<main data-sections-slot="main"></main>
```

Optional special anchor:

```html
<div data-section-type="photo"></div>
```

Required visual structure:

```html
<div class="resume-header-divider" aria-hidden="true"></div>
```

This is the recommended explicit form of the **Header Divider** / 头部分隔符: a visual separator between the header special sections (`name`, `contact`, optional `photo`) and ordinary sections. Header Divider is a template structure element, not a Section, so do not add it to `content.json`, `section_order`, or `data-section-type`.

The React renderer injects ordinary sections into `[data-sections-slot="main"]` as:

```html
<section class="resume-section" data-section-id="sec_A1b2C3d4">
  <h2 class="resume-section-title">项目经历</h2>
  <div class="resume-section-content markdown-body">...</div>
</section>
```

Template CSS should style these stable classes:

```css
.resume-section {}
.resume-section-title {}
.resume-section-content {}
.markdown-body {}
```

## Inner inline columns (` ```inner ` blocks)

Section content may use fenced **`inner`** blocks for horizontal inline columns inside `.resume-section-content`. The renderer turns each `-` line into one grid column; column bodies still use normal Markdown (for example `###` headings).

Templates **must** include the CSS below so inner rows stay within the content box (same horizontal bounds as section title underlines and page margins). Without it, inner columns render as unstyled HTML and may overflow.

Required CSS (copy into every new or updated `template.html`):

```css
.inner-row {
  display: grid;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}
.inner-col {
  min-width: 0;
  overflow-wrap: anywhere;
  box-sizing: border-box;
}
.inner-col--left { text-align: left; }
.inner-col--center { text-align: center; }
.inner-col--right { text-align: right; }
.inner-col h1, .inner-col h2, .inner-col h3,
.inner-col h4, .inner-col h5, .inner-col h6,
.inner-col p { margin: 0; }
```

Design notes:

- Use **CSS Grid + `fr` tracks**, not flex `50%` columns plus gap — percentage flex bases overflow the content width.
- Inner rows must not use whole-row `transform: scale(...)`.
- When updating project example templates, also sync runtime copies under `~/.resume-copilot/resumes/<name>/template.html` (dev reads `examples/`, production reads the runtime home).

Example templates with inner CSS: `examples/resumes/通用技术简历/template.html`.

## Typography / 正文两端对齐

The app injects body-copy justification into preview and PDF export. Templates do **not** need to duplicate this CSS.

```css
.resume-section-content > p,
.resume-section-content > ul > li,
.resume-section-content > ol > li {
  text-align: justify;
  text-justify: inter-ideograph;
}
```

Rules:

- Applies to ordinary section paragraphs and list items only (direct children of `.resume-section-content`).
- Headings, name, contact, and centered header blocks stay unchanged.
- **`inner` columns are excluded** — they keep default center alignment; `[[` and `]]` still control left/right columns.
- Do not add competing `text-align` rules on `.resume-section-content p` or list items unless the user explicitly asks for left-aligned body copy.

## Dynamic schema lookup

Before generating or validating a template, try to fetch the live backend schema:

```bash
curl -s http://127.0.0.1:8901/api/section-schema | python3 -m json.tool
```

If the backend is not running, fall back to the documented defaults:

- Required special sections: `name`, `contact`
- Optional special section: `photo`
- Ordinary section slot: `[data-sections-slot="main"]`
- Ordinary section classes: `.resume-section`, `.resume-section-title`, `.resume-section-content`, `.markdown-body`

## Template design rules

1. Keep template self-contained: normal HTML + CSS in `template.html`.
2. Required anchors must exist exactly once or at least be unambiguous.
3. Main slot must exist exactly once.
4. Do not model ordinary sections with `{{education}}`, `{{projects}}`, `{{skills}}`, etc.
5. `name` renders as plain text.
6. `contact` renders as inline text joined by ` · `.
7. `photo` may render data URLs, safe http(s) image sources, Markdown image sources, or text placeholder.
8. Header Divider / 头部分隔符 is required as a visual separator after the header special sections and before ordinary sections:
   - It is a template visual structure element, not a Section.
   - Do not add `header_divider` or similar IDs to `content.json` or `section_order`.
   - Recommended explicit implementation: `<div class="resume-header-divider" aria-hidden="true"></div>`.
   - Alternative implementations are allowed if visually harmonious: long horizontal line, thick bar, centered short line, gradient fade line, `.resume-header { border-bottom: ... }`, or `.resume-header::after` decoration.
   - The design requirement is visual separation, not a fixed shape.
9. Heading hierarchy must follow the approved **relative** scale, not a fixed absolute size. Use `.resume-section-title` / Markdown h2 as the baseline `1.00×`:
   - Name Section `[data-section-type="name"]`: `34/14 = 2.43×` baseline, with much wider tracking than Markdown h1.
   - Markdown h1 `.resume-section-content h1`: `28/14 = 2.00×` baseline.
   - Section title `.resume-section-title`: `1.00×` baseline.
   - Markdown h2 `.resume-section-content h2`: `1.00×` baseline and should visually match `.resume-section-title`.
   - Markdown h3 `.resume-section-content h3`: `12.5/14 = 0.89×` baseline.
   - Markdown h4 `.resume-section-content h4`: `11.25/14 = 0.80×` baseline.
   - Markdown h5 `.resume-section-content h5`: `10.5/14 = 0.75×` baseline.
   - Markdown h6 `.resume-section-content h6`: `10/14 = 0.71×` baseline.
   - Example absolute implementation: name `34pt`, Markdown h1 `28pt`, section title / h2 `14pt`, h3 `12.5pt`, h4 `11.25pt`, h5 `10.5pt`, h6 `10pt`.
   - Do not force Name Section to equal Markdown h1; Name is intentionally larger and wider-tracked.
10. Keep Page Margin and full-width dividers horizontal-stable. Header Divider and section title rules should remain `width: 100%` inside the content box and should not be shortened by transform-based scaling.
11. Avoid relying on external fonts as the only font source; include local Chinese font fallbacks such as `PingFang SC`, `Microsoft YaHei`, `Noto Sans SC`, `sans-serif`.
12. Preserve the existing visual intent unless the user explicitly asks for a redesign.
13. Do not add AI UI to the frontend template; AI interaction happens in Hermes terminal chat.
14. Include **inner inline column CSS** (`.inner-row`, `.inner-col`, alignment modifiers) in every template so ` ```inner ` content blocks render correctly in preview and PDF export.

## Photo Section guidance

Photo is an optional special section. Best practice when generating templates:

### Decision gate

Before including `[data-section-type="photo"]` in a generated template, the agent should ask the user whether they want a photo resume. If the user has not expressed an intent, default to no photo (simpler, wider compatibility). Only add the photo anchor when the user explicitly confirms.

### Layout geometry rules (warning-level, not errors)

Photo Section geometry should follow these rules, verified by `check-photo-layout` after browser measurement:

| Rule | Constraint | Tolerance | Rationale |
|------|-----------|-----------|-----------|
| Aspect ratio | width/height ≈ 3:4 (0.75) | ±0.04 | Standard portrait photo ratio |
| Top alignment | photo top ≈ header content top | ±2px | Visual top-edge alignment |
| Right alignment | photo right ≈ ordinary section right | ±2px | Right edge flush with content |
| Gap to divider | photo bottom → divider top | 1px–8px | Close but not overlapping |

All four checks are warning-level because visual design is partly subjective. The tool flags drift from the approved example geometry but does not block layout.

The goal of these rules is to make the photo **as large as possible without disturbing the existing header rhythm**. Do not move the Header Divider or compress Contact just to make the photo touch the divider. Preserve Name → Contact and Contact → Header Divider spacing first; then size the photo within that fixed header space.

### Measurement pipeline

```bash
# 1. Measure via Playwright
cd /Users/jqf/Projects/ResumeCopilot
uv run --project resume-web/backend python resume-skill/template/scripts/measure_photo_layout.py \
  --template path/to/template.html \
  -o /tmp/measurements.json

# 2. Evaluate against approved geometry
python3 resume-skill/template/scripts/resume_template.py \
  check-photo-layout --measurements /tmp/measurements.json
```

Keep the measurement and evaluation as two explicit steps so the intermediate JSON can be inspected and attached to review notes.

## Helper script

Validate a template file:

```bash
python3 resume-skill/template/scripts/resume_template.py validate --template ~/.resume-copilot/resumes/通用技术简历/template.html
```

Validate a project example:

```bash
python3 resume-skill/template/scripts/resume_template.py validate --template examples/resumes/通用技术简历/template.html
```

The helper is intentionally read-only. It does not edit templates and does not call complex template mutation APIs. It validates required anchors/slots and reports warnings for common design drift such as missing Header Divider visual structure, heading relative scale drift from the approved example ratios, missing h1-h6 font-size definitions, or mismatched section title vs Markdown h2.

## Workflow

1. Fetch backend schema if available.
2. Read the target `template.html`.
3. Modify or generate the template.
4. Run `resume_template.py validate`.
5. If the app is running, refresh `http://127.0.0.1:5173` and visually inspect the preview.

## Common pitfalls

- Missing `[data-sections-slot="main"]` means ordinary sections will not render.
- Putting ordinary placeholders like `{{projects}}` into the template reintroduces the legacy model.
- Deleting `[data-section-type="name"]` or `[data-section-type="contact"]` breaks required sections.
- Do not model Header Divider as a Section; it belongs to template structure/CSS.
- If the helper warns that Header Divider was not detected but the design has a custom separator, prefer adding explicit `.resume-header-divider` markup or a recognizable `.resume-header` border/pseudo-element so the convention is machine-checkable.
- Styling only old placeholder wrappers and not `.resume-section-*` makes injected ordinary sections look wrong.
- Multiple main slots are ambiguous; keep one main slot for now.
- Do not use whole-content `transform: scale(...)` to squeeze content onto one page. It breaks equal margins and makes long horizontal rules stop before the right Page Margin.
- Missing `.inner-row` grid CSS makes ` ```inner ` blocks look broken or overflow past section title rules; add the required inner CSS from this skill.
