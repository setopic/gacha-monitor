"""設計文書の Markdown を HTML に変換して _site/ に書き出す。

**AI に生成させない。** 入力が同じなら出力も同じであることを守る。
生成のたびに見た目が変わると差分レビューが効かず、費用も毎回かかる。

GitHub の Mermaid はエッジ 500 本で描画を打ち切る（G018）。**ここは自前で
ホストするので `maxEdges` を自分で決められる。** README には間引いた図を置き、
間引かない全体図はこちら側に置く、という役割分担が成り立つ。

使い方:

    python .github/scripts/build_docs.py --out _site
"""

from __future__ import annotations

import argparse
import html
import re
import shutil
from pathlib import Path

import markdown

MERMAID_VERSION = "11.4.1"
MAX_EDGES = 2000

# ```mermaid ... ``` を取り出す。Markdown に食わせる前に退避しないと、
# 図の中の --> が HTML コメントの閉じと解釈されて壊れる。
MERMAID_RE = re.compile(r"^```mermaid[ \t]*\n(.*?)^```[ \t]*$", re.M | re.S)

# href="foo.md" / href="../x/y.md#anchor" を .html に差し替える。
# 外部 URL（scheme 付き）は触らない。
MD_HREF_RE = re.compile(r'href="(?!\w+:)([^"#]+)\.md((?:#[^"]*)?)"')

PAGE = """<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700&family=IBM+Plex+Mono:wght@400;600&display=swap">
<style>{css}</style>
</head>
<body>
<nav class="site-nav"><a href="{root}index.html">gacha-monitor</a>{crumb}</nav>
<main>
{body}
</main>
<footer>この頁は <code>{source}</code> から自動生成されている。編集は Markdown 側で行う。</footer>
<script type="module">
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@{mermaid_version}/dist/mermaid.esm.min.mjs";
mermaid.initialize({{
  startOnLoad: true,
  maxEdges: {max_edges},
  theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default",
  securityLevel: "strict",
}});
</script>
</body>
</html>
"""

CSS = """
:root {
  --ground: #f4f6f4; --surface: #fff; --ink: #16211f; --ink-mute: #6c7a77;
  --rule: #d9e0dd; --accent: #0e6e64; --sunk: #edf0ee;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ground: #101614; --surface: #18201e; --ink: #e7edeb; --ink-mute: #8b9996;
    --rule: #2a3431; --accent: #4fbbac; --sunk: #141b19;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--ground); color: var(--ink);
  font-family: "Zen Kaku Gothic New", "Hiragino Sans", "Yu Gothic UI", Meiryo, system-ui, sans-serif;
  font-size: 15px; line-height: 1.85;
}
.site-nav {
  border-bottom: 1px solid var(--rule); padding: .7rem 1.5rem;
  font-size: .8125rem; color: var(--ink-mute); background: var(--surface);
}
.site-nav a { color: var(--accent); text-decoration: none; }
.site-nav a:hover { text-decoration: underline; }
.site-nav span { margin: 0 .4em; }
main { max-width: 46rem; margin: 0 auto; padding: 2rem 1.5rem 5rem; }
h1, h2, h3 { line-height: 1.4; text-wrap: balance; }
h1 { font-size: 1.9rem; margin: .5rem 0 1.5rem; }
h2 { font-size: 1.35rem; margin: 2.5rem 0 .8rem; padding-bottom: .3rem; border-bottom: 1px solid var(--rule); }
h3 { font-size: 1.1rem; margin: 1.8rem 0 .5rem; }
a { color: var(--accent); text-underline-offset: 3px; }
code {
  font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace; font-size: .85em;
  background: var(--sunk); border: 1px solid var(--rule); border-radius: 3px; padding: .05em .4em;
}
pre { background: var(--sunk); border: 1px solid var(--rule); border-radius: 5px; padding: 1rem; overflow-x: auto; }
pre code { background: none; border: 0; padding: 0; font-size: .8125rem; }
pre.mermaid { background: none; border: 0; padding: 0; overflow-x: auto; text-align: center; }
table { border-collapse: collapse; width: 100%; font-size: .875rem; margin: 0 0 1.2rem; display: block; overflow-x: auto; }
th { text-align: left; color: var(--ink-mute); border-bottom: 1.5px solid var(--rule); padding: 0 .9rem .4rem 0; white-space: nowrap; }
td { border-bottom: 1px solid var(--rule); padding: .55rem .9rem .55rem 0; vertical-align: top; }
blockquote { border-left: 3px solid var(--rule); margin: 0 0 1.2rem; padding-left: 1rem; color: var(--ink-mute); }
hr { border: 0; border-top: 1px solid var(--rule); margin: 2.5rem 0; }
li::marker { color: var(--accent); }
footer {
  border-top: 1px solid var(--rule); padding: 1rem 1.5rem 3rem;
  font-size: .8125rem; color: var(--ink-mute); text-align: center;
}
"""


def extract_mermaid(text: str) -> tuple[str, list[str]]:
    """Mermaid の図を退避し、置き換え用の目印を残す。"""
    blocks: list[str] = []

    def take(match: re.Match) -> str:
        blocks.append(match.group(1))
        return f"\n\nGRAPHMERMAIDPLACEHOLDER{len(blocks) - 1}\n\n"

    return MERMAID_RE.sub(take, text), blocks


def restore_mermaid(html_text: str, blocks: list[str]) -> str:
    for index, block in enumerate(blocks):
        marker = f"GRAPHMERMAIDPLACEHOLDER{index}"
        rendered = f'<pre class="mermaid">{html.escape(block)}</pre>'
        html_text = html_text.replace(f"<p>{marker}</p>", rendered)
        html_text = html_text.replace(marker, rendered)
    return html_text


def title_of(text: str, fallback: str) -> str:
    match = re.search(r"^#\s+(.+)$", text, re.M)
    return match.group(1).strip() if match else fallback


def convert(source: Path, root: Path, out_root: Path) -> None:
    text = source.read_text(encoding="utf-8")
    stripped, blocks = extract_mermaid(text)

    body = markdown.markdown(
        stripped,
        extensions=["tables", "fenced_code", "toc", "sane_lists", "attr_list"],
    )
    body = restore_mermaid(body, blocks)
    body = MD_HREF_RE.sub(r'href="\1.html\2"', body)

    rel = source.relative_to(root)
    target = out_root / rel.with_suffix(".html")
    target.parent.mkdir(parents=True, exist_ok=True)

    depth = len(rel.parts) - 1
    crumb = "" if depth == 0 else f'<span>/</span>{"/".join(rel.parts[:-1])}'

    target.write_text(
        PAGE.format(
            title=title_of(text, rel.stem),
            css=CSS,
            body=body,
            source=rel.as_posix(),
            root="../" * depth or "./",
            crumb=crumb,
            mermaid_version=MERMAID_VERSION,
            max_edges=MAX_EDGES,
        ),
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="_site")
    parser.add_argument("--root", default=".")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    out_root = root / args.out
    if out_root.exists():
        shutil.rmtree(out_root)
    out_root.mkdir(parents=True)

    sources = sorted(root.joinpath("docs").rglob("*.md"))
    readme = root / "README.md"
    if readme.is_file():
        sources.append(readme)

    for source in sources:
        convert(source, root, out_root)

    # README を入口にする
    readme_html = out_root / "README.html"
    if readme_html.is_file():
        shutil.copyfile(readme_html, out_root / "index.html")

    print(f"{len(sources)} ページを {out_root.relative_to(root).as_posix()} に書き出しました")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
