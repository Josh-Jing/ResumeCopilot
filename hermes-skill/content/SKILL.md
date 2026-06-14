---
name: resume-copilot-content
description: Safely inspect and edit ResumeCopilot Section v2 content via the FastAPI domain API. Helpers call backend APIs only; they never directly write content.json.
platforms: [macos, linux, windows]
---

# ResumeCopilot Content Skill

Use this skill when filling, rewriting, adding, deleting, or reordering ResumeCopilot resume content.

ResumeCopilot storage:

```text
~/.resume-copilot/resumes/<简历名>/
├── template.html
├── content.json
└── meta.json
```

The web app runs as:

```text
FastAPI backend: http://127.0.0.1:8901
React/Vite frontend: http://127.0.0.1:5173
```

## Golden rule

Prefer backend domain APIs over direct file edits.

```text
Hermes/helper scripts -> http://127.0.0.1:8901/api/... -> FastAPI -> content.json
```

Helper scripts in this skill are API clients only. They do **not** directly write `content.json`, `template.html`, or `meta.json`. If the backend is not running, start it; do not fall back to manual file mutation unless explicitly asked by the user.

## Section v2 model

`content.json` shape:

```json
{
  "version": 2,
  "sections": {
    "name": { "id": "name", "title": "姓名", "content": "候选人姓名" },
    "contact": { "id": "contact", "title": "联系方式", "content": "- 📱 138\n- 📧 a@example.com" },
    "sec_A1b2C3d4": { "id": "sec_A1b2C3d4", "title": "项目经历", "content": "## ResumeCopilot\n- ..." }
  },
  "section_order": ["sec_A1b2C3d4"]
}
```

Rules:

1. `name`, `contact`, and optional `photo` are special sections.
2. `name` and `contact` are required.
3. General sections use stable random IDs shaped `sec_<8 alnum chars>`.
4. General sections do not store `type`.
5. `section_order` contains only general section IDs.
6. Special section positions are controlled by template anchors, not `section_order`.
7. Find ordinary sections by title first, but if title resolution is ambiguous, ask or use explicit `section_id`.

## Backend APIs

Dynamic schema:

```bash
curl -s http://127.0.0.1:8901/api/section-schema | python3 -m json.tool
```

Inspect resume:

```bash
curl -s http://127.0.0.1:8901/api/resumes/<url-encoded-name>/inspect | python3 -m json.tool
```

Validate content:

```bash
curl -s http://127.0.0.1:8901/api/resumes/<url-encoded-name>/content/validate | python3 -m json.tool
```

Resolve a title:

```bash
curl -s 'http://127.0.0.1:8901/api/resumes/<name>/sections/resolve?title=<title>' | python3 -m json.tool
```

Create section:

```bash
curl -s -X POST http://127.0.0.1:8901/api/resumes/<name>/sections \
  -H 'Content-Type: application/json' \
  -d '{"title":"科研经历","content":"## xxx\n- yyy","anchor_section_id":"sec_xxx","where":"after","dry_run":true}' \
  | python3 -m json.tool
```

Patch section:

```bash
curl -s -X PATCH http://127.0.0.1:8901/api/resumes/<name>/sections/<section_id> \
  -H 'Content-Type: application/json' \
  -d '{"content":"new content","dry_run":true}' \
  | python3 -m json.tool
```

Move section:

```bash
curl -s -X POST http://127.0.0.1:8901/api/resumes/<name>/sections/<section_id>/move \
  -H 'Content-Type: application/json' \
  -d '{"anchor_section_id":"sec_yyy","where":"after","dry_run":true}' \
  | python3 -m json.tool
```

Delete section:

```bash
curl -s -X DELETE 'http://127.0.0.1:8901/api/resumes/<name>/sections/<section_id>?dry_run=true' \
  | python3 -m json.tool
```

## Helper script

Use `resume_content.py` from the project root:

```bash
python resume-skill/content/scripts/resume_content.py inspect --resume 通用技术简历
python resume-skill/content/scripts/resume_content.py validate --resume 通用技术简历
python resume-skill/content/scripts/resume_content.py resolve --resume 通用技术简历 --title 项目经历
python resume-skill/content/scripts/resume_content.py add-section --resume 通用技术简历 --title 科研经历 --content-file /tmp/research.md --after-title 教育背景 --dry-run
python resume-skill/content/scripts/resume_content.py update-section --resume 通用技术简历 --id sec_A1b2C3d4 --content-file /tmp/project.md --dry-run
python resume-skill/content/scripts/resume_content.py move-section --resume 通用技术简历 --id sec_A1b2C3d4 --after-title 工作经历 --dry-run
python resume-skill/content/scripts/resume_content.py delete-section --resume 通用技术简历 --id sec_A1b2C3d4 --dry-run
```

Recommended workflow:

1. `inspect` the resume.
2. If targeting by title, run `resolve`.
3. Run the intended mutation with `--dry-run`.
4. Read returned `changed`, `inspect`, and `validation`.
5. If correct, rerun without `--dry-run`.
6. Run `validate`.
7. Let the user inspect the UI at `http://127.0.0.1:5173`.

## Writing style guidance

For content edits:

- Keep content concise enough for one A4 page. ResumeCopilot Fit Policy can gently expand sparse-but-near-full content and compact content up to about 1.3× A4, but it intentionally stops bailing out beyond that to force content editing.
- Prefer resume bullets shaped as: action + technology/context + measurable outcome.
- For NLP / generative AI / Agent roles, surface Agent memory, RAG, LLM tooling, evaluation, and infra impact when relevant.
- Preserve factual claims. Do not invent metrics; ask or phrase qualitatively if data is unavailable.
- Contact section should be a Markdown list. Preview renders it inline joined by ` · `.

## Inner inline columns (` ```inner `)

Use fenced inner blocks inside general section `content` for one-row multi-column layouts (education headers, date ranges aligned left/right, etc.).

Syntax (each `-` line = one column):

````markdown
```inner
- [50%] [[ ### 东北大学
- 本科
- 计算机科学与技术
- 2020.09 – 2024.07
- 专业排名前25%
```
````

Rules:

- `[50%]` sets column width; columns without a width share the remaining space equally.
- `[[` = left-align column text; `]]` = right-align; omit both for center.
- Column body supports normal Markdown (`###`, `**bold**`, etc.).
- The resume's `template.html` must include inner CSS (see template skill); content edits alone are not enough.
- Dev data lives in `examples/resumes/`; production uses `~/.resume-copilot/resumes/`. After changing example templates, sync runtime templates for the same resume name.

Two-column example (school left, details right):

````markdown
```inner
- [[ ### 某理工大学
- ]] 本科 · 软件工程 · 2021.09 – 2025.06
```
````

## Safety rules

- Do not manually generate general section IDs when using the API; let backend generate them.
- Do not put special section IDs in `section_order`.
- Do not delete `name`, `contact`, or `photo` through content helpers.
- Do not edit special section titles.
- Do not proceed when title resolution returns `ambiguous`; ask the user or use an explicit section ID.
- Use `--dry-run` before destructive operations.
