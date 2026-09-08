#!/usr/bin/env python3
"""docs/handbook/*.md → docs/handbook/modu-handbook.html (단일 파일, 외부 의존 없음).

지원 문법: 제목(#~####), 문단, 굵게/인라인 코드/링크, 불릿·번호 목록, 표, 코드 펜스, 인용(>), 구분선(---).
"""
from __future__ import annotations

import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "handbook"
FILES = ["01-PLANNING.md", "02-ARCHITECTURE.md", "03-PROMPTS.md"]
OUT = SRC / "modu-handbook.html"


def slug(text: str, used: set[str]) -> str:
    base = re.sub(r"[^0-9A-Za-z가-힣]+", "-", text).strip("-").lower() or "s"
    s, i = base, 2
    while s in used:
        s, i = f"{base}-{i}", i + 1
    used.add(s)
    return s


def inline(text: str) -> str:
    text = html.escape(text, quote=False)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', text)
    return text


def render(md: str, used: set[str], toc: list[tuple[int, str, str]]) -> str:
    lines = md.splitlines()
    out: list[str] = []
    i = 0
    para: list[str] = []

    def flush_para():
        if para:
            out.append(f"<p>{inline(' '.join(para))}</p>")
            para.clear()

    while i < len(lines):
        ln = lines[i]
        if ln.startswith("```"):
            flush_para()
            j = i + 1
            buf = []
            while j < len(lines) and not lines[j].startswith("```"):
                buf.append(lines[j])
                j += 1
            out.append(f"<pre><code>{html.escape(chr(10).join(buf))}</code></pre>")
            i = j + 1
            continue
        m = re.match(r"^(#{1,4})\s+(.*)$", ln)
        if m:
            flush_para()
            lvl = len(m.group(1))
            text = m.group(2).strip()
            sid = slug(text, used)
            if lvl <= 2:
                toc.append((lvl, text, sid))
            out.append(f'<h{lvl} id="{sid}">{inline(text)}</h{lvl}>')
            i += 1
            continue
        if re.match(r"^\s*---+\s*$", ln):
            flush_para()
            out.append("<hr>")
            i += 1
            continue
        if ln.startswith(">"):
            flush_para()
            buf = []
            while i < len(lines) and lines[i].startswith(">"):
                buf.append(lines[i][1:].strip())
                i += 1
            out.append(f"<blockquote>{inline(' '.join(buf))}</blockquote>")
            continue
        if ln.startswith("|"):
            flush_para()
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append(lines[i])
                i += 1
            cells = [[c.strip() for c in r.strip().strip("|").split("|")] for r in rows]
            body = [r for r in cells if not all(re.match(r"^:?-{2,}:?$", c) for c in r)]
            if not body:
                continue
            head, rest = body[0], body[1:]
            t = ["<div class='tbl'><table><thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead><tbody>"]
            for r in rest:
                t.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>")
            t.append("</tbody></table></div>")
            out.append("".join(t))
            continue
        lm = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", ln)
        if lm:
            flush_para()
            ordered = lm.group(2)[0].isdigit()
            tag = "ol" if ordered else "ul"
            items = []
            while i < len(lines):
                m2 = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", lines[i])
                if not m2:
                    break
                items.append(m2.group(3))
                i += 1
            out.append(f"<{tag}>" + "".join(f"<li>{inline(x)}</li>" for x in items) + f"</{tag}>")
            continue
        if ln.strip() == "":
            flush_para()
            i += 1
            continue
        para.append(ln.strip())
        i += 1
    flush_para()
    return "\n".join(out)


CSS = """
:root{--bg:#fff;--fg:#1f2430;--muted:#5b6472;--line:#e3e6ec;--accent:#6d28d9;--code:#f4f5f8}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,"Segoe UI","Apple SD Gothic Neo","Noto Sans KR",sans-serif;color:var(--fg);background:var(--bg);line-height:1.6}
.wrap{display:grid;grid-template-columns:260px 1fr;min-height:100vh}
nav{position:sticky;top:0;height:100vh;overflow:auto;border-right:1px solid var(--line);padding:20px 16px;font-size:13px;background:#faf9fd}
nav h1{font-size:15px;margin:0 0 12px}nav a{display:block;color:var(--fg);text-decoration:none;padding:3px 6px;border-radius:6px}nav a:hover{background:#ede9fe}
nav .l1{font-weight:700;margin-top:10px}nav .l2{padding-left:14px;color:var(--muted)}
main{padding:32px 48px;max-width:1100px}
h1{font-size:26px;border-bottom:2px solid var(--accent);padding-bottom:8px;margin-top:48px}h1:first-child{margin-top:0}
h2{font-size:20px;margin-top:36px;border-bottom:1px solid var(--line);padding-bottom:4px}h3{font-size:16px;margin-top:24px}h4{font-size:14px}
code{background:var(--code);padding:1px 5px;border-radius:4px;font-size:12.5px;font-family:ui-monospace,Menlo,Consolas,monospace}
pre{background:#111827;color:#e5e7eb;padding:14px 16px;border-radius:8px;overflow:auto;font-size:12.5px;line-height:1.5}pre code{background:none;color:inherit;padding:0}
blockquote{margin:12px 0;padding:8px 14px;border-left:4px solid var(--accent);background:#f5f3ff;color:#3b3352;font-size:13.5px}
.tbl{overflow-x:auto;margin:12px 0}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid var(--line);padding:6px 8px;vertical-align:top;text-align:left}th{background:#f3f4f6}
hr{border:0;border-top:1px solid var(--line);margin:28px 0}
.meta{color:var(--muted);font-size:12px;margin-bottom:24px}
@media (max-width:900px){.wrap{grid-template-columns:1fr}nav{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}main{padding:20px}}
@media print{nav{display:none}.wrap{display:block}main{padding:0}}
"""


def main() -> None:
    used: set[str] = set()
    toc: list[tuple[int, str, str]] = []
    sections = []
    for f in FILES:
        sections.append(render((SRC / f).read_text(encoding="utf-8"), used, toc))
    nav = "".join(f'<a class="l{l}" href="#{s}">{html.escape(t.replace("`", ""))}</a>' for l, t, s in toc)
    body = "<hr>".join(sections)
    doc = f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>모두의창업 플랫폼 핸드북</title><style>{CSS}</style></head>
<body><div class="wrap"><nav><h1>모두의창업 플랫폼 핸드북</h1>{nav}</nav>
<main><p class="meta">기획 · 구조 · 전달받은 프롬프트 — docs/handbook/*.md 에서 생성 (scripts/build-handbook.py)</p>{body}</main></div></body></html>
"""
    OUT.write_text(doc, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size:,} bytes, {len(toc)} headings)")


if __name__ == "__main__":
    main()
