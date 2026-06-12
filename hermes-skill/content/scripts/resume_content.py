#!/usr/bin/env python3
"""ResumeCopilot content helper.

Thin API client for ResumeCopilot backend semantic content APIs. This script
never directly reads or writes ~/.resume-copilot/resumes/*.json.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_BACKEND = "http://127.0.0.1:8901"


class ApiError(Exception):
    pass


def request_json(backend: str, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    url = backend.rstrip("/") + path
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise ApiError(f"HTTP {exc.code} {url}: {body}") from exc
    except urllib.error.URLError as exc:
        raise ApiError(
            f"ResumeCopilot backend is not reachable at {backend}. Start FastAPI on 127.0.0.1:8901 first. ({exc})"
        ) from exc


def resume_path(resume: str, suffix: str) -> str:
    return f"/api/resumes/{urllib.parse.quote(resume, safe='')}{suffix}"


def print_json(data: Any) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2))


def read_content_arg(args: argparse.Namespace) -> str:
    if getattr(args, "content_file", None):
        return Path(args.content_file).expanduser().read_text(encoding="utf-8")
    return getattr(args, "content", "") or ""


def resolve_anchor(args: argparse.Namespace) -> str | None:
    if getattr(args, "anchor_id", None):
        return args.anchor_id
    title = getattr(args, "after_title", None) or getattr(args, "before_title", None)
    if not title:
        return None
    result = request_json(
        args.backend,
        "GET",
        resume_path(args.resume, "/sections/resolve?title=" + urllib.parse.quote(title, safe="")),
    )
    if result.get("status") != "unique":
        raise ApiError(f"cannot resolve anchor title {title!r}: {json.dumps(result, ensure_ascii=False)}")
    return result["section"]["id"]


def where_from_args(args: argparse.Namespace) -> str:
    if getattr(args, "before_title", None):
        return "before"
    if getattr(args, "before_id", None):
        return "before"
    return getattr(args, "where", None) or "after"


def cmd_schema(args: argparse.Namespace) -> int:
    print_json(request_json(args.backend, "GET", "/api/section-schema"))
    return 0


def cmd_inspect(args: argparse.Namespace) -> int:
    print_json(request_json(args.backend, "GET", resume_path(args.resume, "/inspect")))
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    data = request_json(args.backend, "GET", resume_path(args.resume, "/content/validate"))
    print_json(data)
    return 0 if data.get("ok") else 1


def cmd_resolve(args: argparse.Namespace) -> int:
    result = request_json(
        args.backend,
        "GET",
        resume_path(args.resume, "/sections/resolve?title=" + urllib.parse.quote(args.title, safe="")),
    )
    print_json(result)
    return 0 if result.get("status") == "unique" else 1


def cmd_add_section(args: argparse.Namespace) -> int:
    anchor_id = args.anchor_id or resolve_anchor(args)
    payload = {
        "title": args.title,
        "content": read_content_arg(args),
        "anchor_section_id": anchor_id,
        "where": where_from_args(args),
        "dry_run": args.dry_run,
    }
    print_json(request_json(args.backend, "POST", resume_path(args.resume, "/sections"), payload))
    return 0


def cmd_update_section(args: argparse.Namespace) -> int:
    payload: dict[str, Any] = {"dry_run": args.dry_run}
    if args.title is not None:
        payload["title"] = args.title
    if args.content is not None or args.content_file is not None:
        payload["content"] = read_content_arg(args)
    print_json(request_json(args.backend, "PATCH", resume_path(args.resume, f"/sections/{args.id}"), payload))
    return 0


def cmd_move_section(args: argparse.Namespace) -> int:
    anchor_id = args.anchor_id or args.after_id or args.before_id or resolve_anchor(args)
    if not anchor_id:
        raise ApiError("move-section requires --anchor-id/--after-id/--before-id or --after-title/--before-title")
    payload = {
        "anchor_section_id": anchor_id,
        "where": where_from_args(args),
        "dry_run": args.dry_run,
    }
    print_json(request_json(args.backend, "POST", resume_path(args.resume, f"/sections/{args.id}/move"), payload))
    return 0


def cmd_delete_section(args: argparse.Namespace) -> int:
    suffix = f"/sections/{args.id}?dry_run={'true' if args.dry_run else 'false'}"
    print_json(request_json(args.backend, "DELETE", resume_path(args.resume, suffix)))
    return 0


def add_common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--backend", default=DEFAULT_BACKEND, help="ResumeCopilot backend URL")


def add_resume(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--resume", required=True, help="resume name, e.g. 通用技术简历")


def add_content_args(parser: argparse.ArgumentParser) -> None:
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--content", help="Markdown content literal")
    group.add_argument("--content-file", help="Path to file containing Markdown content")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="ResumeCopilot content API helper")
    add_common(parser)
    sub = parser.add_subparsers(dest="command", required=True)

    schema = sub.add_parser("schema", help="fetch section schema")
    schema.set_defaults(func=cmd_schema)

    inspect = sub.add_parser("inspect", help="inspect resume content")
    add_resume(inspect)
    inspect.set_defaults(func=cmd_inspect)

    validate = sub.add_parser("validate", help="validate resume content")
    add_resume(validate)
    validate.set_defaults(func=cmd_validate)

    resolve = sub.add_parser("resolve", help="resolve section title to id")
    add_resume(resolve)
    resolve.add_argument("--title", required=True)
    resolve.set_defaults(func=cmd_resolve)

    add = sub.add_parser("add-section", help="create a general section")
    add_resume(add)
    add.add_argument("--title", required=True)
    add_content_args(add)
    add.add_argument("--anchor-id")
    add.add_argument("--after-title")
    add.add_argument("--before-title")
    add.add_argument("--where", choices=["before", "after"], default="after")
    add.add_argument("--dry-run", action="store_true")
    add.set_defaults(func=cmd_add_section)

    update = sub.add_parser("update-section", help="patch a section by id")
    add_resume(update)
    update.add_argument("--id", required=True)
    update.add_argument("--title")
    add_content_args(update)
    update.add_argument("--dry-run", action="store_true")
    update.set_defaults(func=cmd_update_section)

    move = sub.add_parser("move-section", help="move a general section")
    add_resume(move)
    move.add_argument("--id", required=True)
    move.add_argument("--anchor-id")
    move.add_argument("--after-id")
    move.add_argument("--before-id")
    move.add_argument("--after-title")
    move.add_argument("--before-title")
    move.add_argument("--where", choices=["before", "after"], default="after")
    move.add_argument("--dry-run", action="store_true")
    move.set_defaults(func=cmd_move_section)

    delete = sub.add_parser("delete-section", help="delete a general section")
    add_resume(delete)
    delete.add_argument("--id", required=True)
    delete.add_argument("--dry-run", action="store_true")
    delete.set_defaults(func=cmd_delete_section)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return args.func(args)
    except ApiError as exc:
        print(str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
