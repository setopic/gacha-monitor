"""PR が指している文書ノードが実在するかを確かめる。

**実装のコミットは既にノード id を書いている**（tournament で 95%、
medieval-idle で 100%）。慣習として成立しているものを、機械が確かめるだけにする。

`なし` と書けば通す。文書に対応が無い変更（依存の更新、設定の修正）は必ずある。
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from tools.graph.loader import load  # noqa: E402

ID = re.compile(r"\b(?:[A-Z]{2,5}-\d{2,4})\b")
NONE = ("なし", "none", "n/a")


def main() -> int:
    text = (os.environ.get("PR_TITLE", "") + "\n" + os.environ.get("PR_BODY", ""))
    graph = load(Path(__file__).resolve().parents[2])

    if any(word in text.lower() for word in NONE):
        print("「なし」と書かれているので確かめません")
        return 0

    found = sorted(set(ID.findall(text)))
    if not found:
        print("対応するノードが書かれていません。")
        print("id を書くか、対応が無いなら「なし」と書いてください。")
        return 1

    missing = [i for i in found if i not in graph.nodes]
    print("参照:", " ".join(found))
    if missing:
        print("実在しないノード:", " ".join(missing))
        return 1

    print("すべて実在します")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
