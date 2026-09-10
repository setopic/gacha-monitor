"""本文の `[[ID]]` を、その id の文書への相対リンクに書き換える。

`[[ID]]` はこのグラフの参照記法で、loader は `mentions` エッジとして解釈する。
ただし **Markdown の標準記法ではないので、GitHub 上ではただの文字として出る。**
読み手はクリックできず、id を見て自分でファイルを探すことになる。

相対リンク（`[CON-01](../40-contracts/con-01-....md)`）も loader は同じ
`mentions` として拾う。**つまりグラフを一切変えずに、どこでもクリックできる
形にできる。**

書くときは `[[ID]]` のままでよい。**このコマンドが整形する**（`sync` と同じ
位置づけで、CI が `--check` で最新かどうかを見る）。

存在しない id はそのまま残す。リンク切れは `G004` の仕事で、
ここで黙って消すと検査をすり抜ける。
"""

from __future__ import annotations

import re
from pathlib import Path

from .model import Graph
from .rename import _apply_outside_protected, _relative, _scan_targets

# [[UC-01]] / [[UC-01|表示名]]。loader の WIKILINK_RE と同じ形を受ける。
WIKILINK_RE = re.compile(r"\[\[([A-Za-z]+-[0-9]+)(?:\|([^\]]*))?\]\]")


def _rewrite(text: str, index: dict[str, Path], from_dir: Path) -> str:
    def replace(match: re.Match) -> str:
        node_id = match.group(1)
        label = match.group(2)
        target = index.get(node_id)
        if target is None:
            return match.group(0)  # 存在しない id は残す（G004 が言う）
        return f"[{label or node_id}]({_relative(target, from_dir)})"

    return _apply_outside_protected(text, lambda part: WIKILINK_RE.sub(replace, part))


def linkify(graph: Graph, root: Path, docs: Path, *, dry_run: bool = False) -> list[str]:
    """`[[ID]]` を相対リンクに直す。書き換えたファイルの相対パスを返す。

    `dry_run` なら書き込まず、書き換えが必要なファイルだけを返す（CI 用）。
    """
    index = {node.id: node.path for node in graph.nodes.values()}
    changed: list[str] = []

    for path in _scan_targets(root, docs):
        original = path.read_text(encoding="utf-8")
        if "[[" not in original:
            continue  # 走査の大半はここで終わる
        updated = _rewrite(original, index, path.parent)
        if updated == original:
            continue
        changed.append(path.relative_to(root).as_posix())
        if not dry_run:
            path.write_text(updated, encoding="utf-8")

    return changed
