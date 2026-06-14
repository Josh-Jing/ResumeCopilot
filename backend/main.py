"""ResumeCopilot backend — FastAPI + file storage + optional static frontend."""

from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from resume_domain import (
    DomainError,
    create_general_section,
    default_content,
    delete_section as domain_delete_section,
    get_section_schema as domain_get_section_schema,
    inspect_content,
    move_section as domain_move_section,
    normalize_content,
    resolve_section_by_title,
    update_section as domain_update_section,
    validate_content,
)
from resume_pdf import (
    build_content_disposition,
    build_print_html,
    render_pdf_bytes,
)

# ── Paths ───────────────────────────────────────────────────────────────────


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _configured_home() -> Path:
    return Path(os.environ.get("RESUME_COPILOT_HOME", Path.home() / ".resume-copilot"))


RESUME_COPILOT_HOME = _configured_home()
RESUMES_DIR = RESUME_COPILOT_HOME / "resumes"
FRONTEND_DIST = Path(os.environ.get("FRONTEND_DIST", _project_root() / "frontend" / "dist"))
SERVE_FRONTEND = os.environ.get("SERVE_FRONTEND", "auto").lower() in {"1", "true", "auto"}


def _example_resumes_dir() -> Path:
    return _project_root() / "examples" / "resumes"


def _default_template_path() -> Path:
    return _example_resumes_dir() / "通用技术简历" / "template.html"


# ── Storage helpers ───────────────────────────────────────────────────────────


def _ensure_dir() -> None:
    RESUMES_DIR.mkdir(parents=True, exist_ok=True)


def _resume_path(name: str) -> Path:
    return RESUMES_DIR / name


def _require_resume_dir(name: str) -> Path:
    rdir = _resume_path(name)
    if not rdir.exists():
        raise HTTPException(404, f"Resume '{name}' not found")
    return rdir


def _now() -> str:
    return datetime.now().isoformat()


def _touch_meta(rdir: Path, name: str) -> None:
    mp = rdir / "meta.json"
    meta: dict = {}
    if mp.exists():
        try:
            meta = json.loads(mp.read_text(encoding="utf-8"))
        except Exception:
            meta = {}
    meta["name"] = name
    meta.setdefault("created_at", _now())
    meta["updated_at"] = _now()
    mp.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def _write_fresh_meta(rdir: Path, name: str) -> None:
    now = _now()
    (rdir / "meta.json").write_text(
        json.dumps({"name": name, "created_at": now, "updated_at": now}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _list_resumes() -> list[dict]:
    _ensure_dir()
    result = []
    for d in sorted(RESUMES_DIR.iterdir()):
        if d.is_dir() and (d / "content.json").exists():
            meta: dict = {}
            meta_path = d / "meta.json"
            if meta_path.exists():
                try:
                    meta = json.loads(meta_path.read_text(encoding="utf-8"))
                except Exception:
                    pass
            result.append({
                "name": d.name,
                "updated_at": meta.get("updated_at", ""),
                "created_at": meta.get("created_at", ""),
            })
    return result


def _read_content(rdir: Path) -> dict:
    cp = rdir / "content.json"
    if not cp.exists():
        return default_content()
    try:
        return normalize_content(json.loads(cp.read_text(encoding="utf-8")))
    except Exception:
        return default_content()


def _write_content(rdir: Path, content: dict) -> None:
    normalized = normalize_content(content)
    (rdir / "content.json").write_text(
        json.dumps(normalized, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _validate_resume_name(name: str) -> str:
    clean = name.strip()
    if not clean:
        raise HTTPException(400, "resume name cannot be empty")
    if clean in {".", ".."} or Path(clean).name != clean or "/" in clean or "\\" in clean:
        raise HTTPException(400, "resume name cannot contain path separators")
    return clean


def _unique_copy_name(name: str) -> str:
    base = f"{name} 副本"
    if not _resume_path(base).exists():
        return base
    index = 2
    while _resume_path(f"{base} {index}").exists():
        index += 1
    return f"{base} {index}"


def _domain_error_to_http(exc: DomainError) -> HTTPException:
    message = str(exc)
    if "not found" in message:
        return HTTPException(404, message)
    return HTTPException(400, message)


def _operation_response(name: str, content: dict, *, changed: list[str], dry_run: bool) -> dict:
    normalized = normalize_content(content)
    return {
        "status": "ok",
        "changed": changed,
        "dry_run": dry_run,
        "content": normalized,
        "inspect": inspect_content(normalized, name=name),
        "validation": validate_content(normalized),
    }


def _save_operation_result(name: str, rdir: Path, content: dict, *, changed: list[str], dry_run: bool) -> dict:
    response = _operation_response(name, content, changed=changed, dry_run=dry_run)
    if not dry_run:
        _write_content(rdir, response["content"])
        _touch_meta(rdir, name)
    return response


# ── Pydantic models ─────────────────────────────────────────────────────────


class ResumeSection(BaseModel):
    id: str
    title: str
    content: str


class ContentUpdate(BaseModel):
    version: int = 2
    sections: dict[str, ResumeSection]
    section_order: list[str]


class ResumeCreate(BaseModel):
    name: str
    template_html: str | None = None
    sections: dict[str, ResumeSection] | None = None


class ResumeCopyRequest(BaseModel):
    new_name: str | None = None


class ResumeRenameRequest(BaseModel):
    new_name: str


class ResumeExportPdfRequest(BaseModel):
    smart_one_page: bool = False
    fit_mode: str | None = None


class SectionUpdate(BaseModel):
    section_id: str
    content: str


class SectionTitleUpdate(BaseModel):
    section_id: str
    title: str


class SectionCreateRequest(BaseModel):
    title: str = "新建 Section"
    content: str = ""
    anchor_section_id: str | None = None
    where: str = "after"
    dry_run: bool = False


class SectionPatchRequest(BaseModel):
    title: str | None = None
    content: str | None = None
    dry_run: bool = False


class SectionMoveRequest(BaseModel):
    anchor_section_id: str
    where: str = "after"
    dry_run: bool = False


# ── WebSocket file watcher ────────────────────────────────────────────────────


class _WsManager:
    connections: list[WebSocket] = []

    @classmethod
    def register(cls, ws: WebSocket) -> None:
        cls.connections.append(ws)

    @classmethod
    def unregister(cls, ws: WebSocket) -> None:
        if ws in cls.connections:
            cls.connections.remove(ws)

    @classmethod
    async def broadcast(cls, message: dict) -> None:
        dead: list[WebSocket] = []
        for ws in cls.connections:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            cls.unregister(ws)


class _ResumeFileHandler(FileSystemEventHandler):
    def on_modified(self, event) -> None:
        if event.is_directory:
            return
        path = Path(event.src_path)
        try:
            rel = path.relative_to(RESUMES_DIR)
            resume_name = rel.parts[0]
            filename = rel.name
        except ValueError:
            return
        try:
            loop = asyncio.get_event_loop()
            loop.create_task(_WsManager.broadcast({
                "type": "file_changed",
                "resume_name": resume_name,
                "filename": filename,
            }))
        except Exception:
            pass


_observer = Observer()
_observer.schedule(_ResumeFileHandler(), str(RESUMES_DIR), recursive=True)
_observer.daemon = True

# ── App ─────────────────────────────────────────────────────────────────────

_ensure_dir()
app = FastAPI(title="ResumeCopilot")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    _ensure_dir()
    if not _observer.is_alive():
        _observer.start()

    examples_dir = _example_resumes_dir()
    if examples_dir.exists():
        for d in examples_dir.iterdir():
            if d.is_dir() and (d / "content.json").exists():
                target = _resume_path(d.name)
                if not target.exists():
                    shutil.copytree(d, target)


@app.on_event("shutdown")
def _shutdown() -> None:
    if _observer.is_alive():
        _observer.stop()
        _observer.join(timeout=2)


# ── API ─────────────────────────────────────────────────────────────────────


@app.get("/api/health")
def health():
    return {"status": "ok", "serve_frontend": _should_serve_frontend()}


@app.get("/api/section-schema")
def get_section_schema():
    return domain_get_section_schema()


@app.get("/api/resumes")
def list_resumes():
    return _list_resumes()


@app.post("/api/resumes")
def create_resume(req: ResumeCreate):
    _ensure_dir()
    name = _validate_resume_name(req.name)
    rdir = _resume_path(name)
    if rdir.exists():
        raise HTTPException(409, f"Resume '{name}' already exists")
    rdir.mkdir(parents=True)

    if req.template_html:
        (rdir / "template.html").write_text(req.template_html, encoding="utf-8")
    else:
        default = _default_template_path()
        if default.exists():
            shutil.copy2(default, rdir / "template.html")
        else:
            (rdir / "template.html").write_text(
                '<!doctype html><html><body><div class="resume">'
                '<h1 data-section-type="name"></h1>'
                '<div data-section-type="contact"></div>'
                '<main data-sections-slot="main"></main>'
                "</div></body></html>",
                encoding="utf-8",
            )

    content = default_content()
    if req.sections:
        content["sections"].update({sid: s.dict() for sid, s in req.sections.items()})
    _write_content(rdir, content)
    _write_fresh_meta(rdir, name)
    return {"name": name, "status": "created"}


@app.get("/api/resumes/{name}")
def get_resume(name: str):
    rdir = _require_resume_dir(name)
    template_html = ""
    tp = rdir / "template.html"
    if tp.exists():
        template_html = tp.read_text(encoding="utf-8")

    meta: dict = {}
    mp = rdir / "meta.json"
    if mp.exists():
        try:
            meta = json.loads(mp.read_text(encoding="utf-8"))
        except Exception:
            pass

    return {
        "name": name,
        "template_html": template_html,
        "content": _read_content(rdir),
        "fields_in_template": re.findall(r"\{\{(\w+)\}\}", template_html),
        "meta": meta,
    }


@app.get("/api/resumes/{name}/inspect")
def inspect_resume(name: str):
    return inspect_content(_read_content(_require_resume_dir(name)), name=name)


@app.get("/api/resumes/{name}/content/validate")
def validate_resume_content(name: str):
    return validate_content(_read_content(_require_resume_dir(name)))


@app.get("/api/resumes/{name}/sections/resolve")
def resolve_resume_section(name: str, title: str = Query(...)):
    return resolve_section_by_title(_read_content(_require_resume_dir(name)), title)


@app.put("/api/resumes/{name}/content")
def update_content(name: str, body: ContentUpdate):
    rdir = _require_resume_dir(name)
    _write_content(rdir, body.dict())
    _touch_meta(rdir, name)
    return {"status": "ok"}


@app.post("/api/resumes/{name}/sections")
def create_section(name: str, body: SectionCreateRequest):
    rdir = _require_resume_dir(name)
    try:
        next_content, section = create_general_section(
            _read_content(rdir),
            title=body.title,
            content_md=body.content,
            anchor_section_id=body.anchor_section_id,
            where=body.where,
        )
    except DomainError as exc:
        raise _domain_error_to_http(exc) from exc
    return _save_operation_result(
        name, rdir, next_content,
        changed=[f"created section {section['id']}"],
        dry_run=body.dry_run,
    )


@app.patch("/api/resumes/{name}/sections/{section_id}")
def patch_section(name: str, section_id: str, body: SectionPatchRequest):
    rdir = _require_resume_dir(name)
    try:
        next_content = domain_update_section(
            _read_content(rdir), section_id,
            title=body.title, content_md=body.content,
        )
    except DomainError as exc:
        raise _domain_error_to_http(exc) from exc

    changed = []
    if body.title is not None:
        changed.append(f"updated section title {section_id}")
    if body.content is not None:
        changed.append(f"updated section content {section_id}")
    if not changed:
        changed.append(f"no-op section update {section_id}")

    return _save_operation_result(name, rdir, next_content, changed=changed, dry_run=body.dry_run)


@app.delete("/api/resumes/{name}/sections/{section_id}")
def delete_resume_section(name: str, section_id: str, dry_run: bool = False):
    rdir = _require_resume_dir(name)
    try:
        next_content = domain_delete_section(_read_content(rdir), section_id)
    except DomainError as exc:
        raise _domain_error_to_http(exc) from exc
    return _save_operation_result(
        name, rdir, next_content,
        changed=[f"deleted section {section_id}"],
        dry_run=dry_run,
    )


@app.post("/api/resumes/{name}/sections/{section_id}/move")
def move_resume_section(name: str, section_id: str, body: SectionMoveRequest):
    rdir = _require_resume_dir(name)
    try:
        next_content = domain_move_section(
            _read_content(rdir), section_id,
            anchor_section_id=body.anchor_section_id,
            where=body.where,
        )
    except DomainError as exc:
        raise _domain_error_to_http(exc) from exc
    return _save_operation_result(
        name, rdir, next_content,
        changed=[f"moved section {section_id} {body.where} {body.anchor_section_id}"],
        dry_run=body.dry_run,
    )


@app.put("/api/resumes/{name}/section")
def update_section(name: str, body: SectionUpdate):
    rdir = _require_resume_dir(name)
    try:
        content = domain_update_section(_read_content(rdir), body.section_id, content_md=body.content)
    except DomainError as exc:
        raise _domain_error_to_http(exc) from exc
    _write_content(rdir, content)
    _touch_meta(rdir, name)
    return {"status": "ok"}


@app.put("/api/resumes/{name}/section-title")
def update_section_title(name: str, body: SectionTitleUpdate):
    rdir = _require_resume_dir(name)
    try:
        content = domain_update_section(_read_content(rdir), body.section_id, title=body.title)
    except DomainError as exc:
        raise _domain_error_to_http(exc) from exc
    _write_content(rdir, content)
    _touch_meta(rdir, name)
    return {"status": "ok"}


@app.put("/api/resumes/{name}/template")
def update_template(name: str, body: dict):
    rdir = _require_resume_dir(name)
    (rdir / "template.html").write_text(body.get("template_html", ""), encoding="utf-8")
    return {"status": "ok"}


@app.delete("/api/resumes/{name}")
def delete_resume(name: str):
    shutil.rmtree(_require_resume_dir(name))
    return {"status": "deleted"}


@app.post("/api/resumes/{name}/copy")
def copy_resume(name: str, body: ResumeCopyRequest):
    source = _require_resume_dir(name)
    target_name = _validate_resume_name(body.new_name) if body.new_name else _unique_copy_name(name)
    target = _resume_path(target_name)
    if target.exists():
        raise HTTPException(409, f"Resume '{target_name}' already exists")
    shutil.copytree(source, target)
    _write_fresh_meta(target, target_name)
    return {"status": "copied", "name": target_name, "source_name": name}


@app.patch("/api/resumes/{name}/rename")
def rename_resume(name: str, body: ResumeRenameRequest):
    source = _require_resume_dir(name)
    target_name = _validate_resume_name(body.new_name)
    if target_name == name:
        return {"status": "renamed", "old_name": name, "name": name}
    target = _resume_path(target_name)
    if target.exists():
        raise HTTPException(409, f"Resume '{target_name}' already exists")
    source.rename(target)
    _touch_meta(target, target_name)
    return {"status": "renamed", "old_name": name, "name": target_name}


@app.post("/api/resumes/{name}/export-pdf")
async def export_pdf(name: str, body: ResumeExportPdfRequest | None = None):
    rdir = _require_resume_dir(name)
    template_path = rdir / "template.html"
    if not template_path.exists():
        raise HTTPException(404, f"template.html for resume '{name}' not found")
    fit_mode = body.fit_mode if body and body.smart_one_page else None
    if fit_mode not in {None, "natural", "expand", "compact", "overflow"}:
        raise HTTPException(400, f"Invalid fit_mode: {fit_mode}")
    print_html = build_print_html(template_path.read_text(encoding="utf-8"), _read_content(rdir), fit_mode=fit_mode)
    try:
        pdf = await render_pdf_bytes(print_html)
    except RuntimeError as exc:
        raise HTTPException(500, str(exc)) from exc
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": build_content_disposition(name)},
    )


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    _WsManager.register(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        _WsManager.unregister(ws)


# ── Static frontend (production) ────────────────────────────────────────────


def _should_serve_frontend() -> bool:
    if SERVE_FRONTEND is False:
        return False
    if os.environ.get("SERVE_FRONTEND", "auto").lower() in {"0", "false", "no"}:
        return False
    return FRONTEND_DIST.is_dir() and (FRONTEND_DIST / "index.html").is_file()


def _mount_frontend() -> None:
    if not _should_serve_frontend():
        return

    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/")
    async def spa_index():
        return FileResponse(FRONTEND_DIST / "index.html")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404)
        candidate = FRONTEND_DIST / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")


_mount_frontend()
