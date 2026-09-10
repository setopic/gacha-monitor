"""テンプレートの版。

派生プロジェクトはこのファイルを共有しているため、`git merge template/main` を
すると自動的に更新される。マージ前は自分の版、マージ後はテンプレートの版になる。

**`schema.py` には置かない。** あちらはプロジェクトが語彙を調整するために
書き換える前提のファイルで、版を混ぜるとマージのたびに競合する。

変更内容と移行手順は TEMPLATE_CHANGELOG.md にある。
"""

from __future__ import annotations

TEMPLATE_VERSION = "1.12.1"

# 動作を保証する Python の下限。**本番ホストの版が決めている。**
# Ubuntu 22.04 に貼り付いた 3.10 で、OS ごと入れ替えない限り動かせない。
# 開発機と CI 本体は 3.12 で回すが、ここより下でも壊れないことを
# graph-check の floor ジョブが毎回確かめている。
#
# 上げるときは 3 つを揃える。ずれたら test_python_floor が落ちる。
#   1. この定数
#   2. .github/workflows/graph-check.yml の floor ジョブ
#   3. README の「必要なもの」
MIN_PYTHON = "3.10"
