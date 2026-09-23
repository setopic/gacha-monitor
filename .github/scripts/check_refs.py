"""PR が指している文書ノードが実在するかを確かめる。

**実装のコミットは既にノード id を書いている**（tournament で 95%、
medieval-idle で 100%）。慣習として成立しているものを、機械が確かめるだけにする。

`なし` と書けば通す。文書に対応が無い変更（依存の更新、設定の修正）は必ずある。
**「なし」と読むのは、行の頭に書いたものだけ**（`なし` / `ノード: なし` で始まる行）。
以前は題と本文のどこかに「なし」を含めば照合を飛ばしており、「問題なし」「更新なし」
「みなし」でも飛んでいた。派生の PR 30 件のうち 10 件が飛び、意図したものは 1 件だった
（setopic/graph-project-template#5）。
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from tools.graph.loader import load  # noqa: E402

ID = re.compile(r"\b(?:[A-Z]{2,5}-\d{2,4})\b")
# 行の頭の「なし」だけ。後ろに続いてよいのは空白・括弧・句読点・行末
NONE_LINE = re.compile(
    r"^\s*(?:ノード\s*[:：]\s*)?(?:なし|none|n/a)(?=[\s（(。、]|$)",
    re.IGNORECASE | re.MULTILINE,
)
# PR テンプレートの記入案内（「`なし` と書く」）を宣言と読まない
COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)


def declares_none(text: str) -> bool:
    """「対応するノードが無い」と書いてあるか。"""
    return bool(NONE_LINE.search(COMMENT.sub("", text)))


def check(text: str, known: set[str]) -> int:
    """題と本文をつないだ `text` を確かめ、終了コードを返す。"""
    if declares_none(text):
        print("「なし」と書かれているので確かめません")
        return 0

    found = sorted(set(ID.findall(text)))
    if not found:
        print("対応するノードが書かれていません。")
        print("id を書くか、対応が無いなら行の頭に「なし」と書いてください。")
        return 1

    missing = [i for i in found if i not in known]
    print("参照:", " ".join(found))
    if missing:
        print("実在しないノード:", " ".join(missing))
        return 1

    print("すべて実在します")
    return 0


def main() -> int:
    # 題も見る。コミットの 1 行目と同じ形（「何をしたか。ADR-0089 / UC-48」）で id を書く慣習がある
    text = os.environ.get("PR_TITLE", "") + "\n" + os.environ.get("PR_BODY", "")
    graph = load(Path(__file__).resolve().parents[2])
    return check(text, set(graph.nodes))


if __name__ == "__main__":
    raise SystemExit(main())
