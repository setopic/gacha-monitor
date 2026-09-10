---
id: IDX-ADR
type: index
title: 決定記録
status: stable
tags: [index]
---

# 決定記録 / ADR（横断）

**決定と、その理由と、却下した案**を残す。層ルールの対象外なので、どの層のノードにも
`decides` を張れる。

- 決定を変えるときは既存 ADR を書き換えず、新しい ADR を起票して `supersedes` で繋ぐ
- 置き換えられた側は `status: deprecated` にする
- 採番は 4 桁ゼロ埋め、欠番を作らない

## ノード一覧

<!-- graph:children:start -->
- [ADR-0001 設計文書をグラフとして管理する](./adr-0001-graph-driven-docs.md)
- [ADR-0002 主指標に保存数を採用する](./adr-0002-save-count-as-metric.md)
- [ADR-0003 追跡期間を 4 日にする](./adr-0003-tracking-window.md)
- [ADR-0004 閾値を 3 段階にする](./adr-0004-three-thresholds.md)
- [ADR-0005 転載と返信をコード側で除外する](./adr-0005-filter-in-code.md)
- [ADR-0006 実行基盤に Apps Script を選ぶ](./adr-0006-apps-script-runtime.md)
<!-- graph:children:end -->

## 追加するとき

```bash
python -m tools.graph new --type adr --id ADR-0002 --title "..." --slug some-slug
```
