#!/usr/bin/env python3
"""Deploy step: turn one built page into a small page plus long-cached assets.

    python3 tools/split_assets.py <built index.html> <output folder>

The page's own <style> blocks become one stylesheet and its large inline <script> becomes one script file, each named
by its content hash (assets/app.<hash>.css / .js), so the browser keeps them for a year and only the small page is fetched
again on a later visit. Both are compacted with esbuild (whitespace and syntax only: no name is renamed, so every
global the page uses keeps its name). Script order and position are kept exactly. Small inline scripts stay inline.
Writes <output>/index.html and <output>/assets/; removes assets of earlier builds from <output>/assets/.
"""
import hashlib, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ESBUILD = HERE / "node" / "node_modules" / ".bin" / "esbuild"
INLINE_MAX = 4096  # scripts smaller than this stay in the page


def compact(code, loader):
    if not ESBUILD.exists():
        sys.exit("esbuild missing: run `npm i --prefix tools/node esbuild@0.25.10`")
    r = subprocess.run([str(ESBUILD), f"--loader={loader}", "--minify-whitespace", "--minify-syntax", "--log-level=error",
                        "--charset=utf8"] + (["--target=es2020"] if loader == "js" else []),
                       input=code.encode("utf-8"), capture_output=True)
    if r.returncode:
        sys.exit(r.stderr.decode()[:2000])
    return r.stdout.decode("utf-8")


def split(src, out):
    html = Path(src).read_text(encoding="utf-8")
    out = Path(out); (out / "assets").mkdir(parents=True, exist_ok=True)
    # one scan in document order, as the browser parses: a <style> or <script> written inside a script's strings is part of that script
    tok = re.compile(r"<script>([\s\S]*?)</script>|<style([^>]*)>([\s\S]*?)</style>")
    parts, css, pos, css_at = [], [], 0, None
    for m in tok.finditer(html):
        parts.append(html[pos:m.start()]); pos = m.end()
        if m.group(1) is not None:
            js = m.group(1)
            if len(js.encode("utf-8")) < INLINE_MAX:
                parts.append(m.group(0)); continue
            body = compact(js, "js")
            name = f"assets/app.{hashlib.sha256(body.encode('utf-8')).hexdigest()[:10]}.js"
            (out / name).write_text(body, encoding="utf-8")
            parts.append(f'<script src="{name}"></script>')
        else:
            if re.search(r"media=|scoped", m.group(2) or ""):
                parts.append(m.group(0)); continue
            css.append(m.group(3))
            if css_at is None:
                css_at = len(parts); parts.append("")  # the stylesheet goes where the first <style> was
    parts.append(html[pos:])
    if css:
        body = compact("\n".join(css), "css")
        name = f"assets/app.{hashlib.sha256(body.encode('utf-8')).hexdigest()[:10]}.css"
        (out / name).write_text(body, encoding="utf-8")
        parts[css_at] = f'<link rel="stylesheet" href="{name}">'
    page = "".join(parts)
    (out / "index.html").write_text(page, encoding="utf-8")
    keep = set(re.findall(r'(?:src|href)="(assets/app\.[0-9a-f]{10}\.(?:js|css))"', page))
    for f in (out / "assets").glob("app.*"):
        if f"assets/{f.name}" not in keep:
            f.unlink()
    return page, sorted(keep)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    page, assets = split(sys.argv[1], sys.argv[2])
    print(f"page {len(page.encode('utf-8')) // 1024} KB · " + " · ".join(f"{a} {(Path(sys.argv[2]) / a).stat().st_size // 1024} KB" for a in assets))
