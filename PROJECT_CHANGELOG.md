# gacha-monitor の変更履歴

**このプロジェクトの履歴。** 検証ツール（`tools/graph`）の変更は
[TEMPLATE_CHANGELOG.md](TEMPLATE_CHANGELOG.md) にある。上流の
`graph-project-template` から `git merge template/main` で流れてくる。

現在の版: **0.1.0**

---

## 0.1.0 — 2026-09-10

最初の版。**実装と運用が先にあり、設計文書を後から起こした。**

### 実装

- `app/monitor.gs` 日次の取得・判定・記録・通知。2026-09-10 から実運用中
- `app/spike.gs` 検証用。取得の可否と指標の水準を 1 回だけ測る

### 設計文書 15 ノード

要件を詰める過程（8 ラウンド）で決まったことを、根拠となった実測値ごと残した。
**半年後に「なぜこうしたか」を再現できることを優先している。**

| ADR | 決めたこと |
| --- | --- |
| [ADR-0002](docs/50-adr/adr-0002-save-count-as-metric.md) | 主指標に保存数を採用する（表示数を見送った理由と実測値） |
| [ADR-0003](docs/50-adr/adr-0003-tracking-window.md) | 追跡期間を 4 日にする（費用の構造と、観測できない限界） |
| [ADR-0004](docs/50-adr/adr-0004-three-thresholds.md) | 閾値を 3 段階にする |
| [ADR-0005](docs/50-adr/adr-0005-filter-in-code.md) | 転載と返信をコード側で除外する |
| [ADR-0006](docs/50-adr/adr-0006-apps-script-runtime.md) | 実行基盤に Apps Script を選ぶ |

### CI 3 本

| ファイル | 見るもの |
| --- | --- |
| `graph-check.yml` | 文書のグラフ（テンプレートが配る。書き換えない） |
| `app-check.yml` | Apps Script の構文、マニフェスト、**監視対象がコードに残っていないか** |
| `deploy.yml` | main への push で Apps Script へ配置する |
| `docs-html.yml` | 設計文書を HTML にして GitHub Pages で公開する |

### 公開にあたって

**このリポジトリは公開されている。** 監視対象はコードにも文書にも書かず、
設定シートの「監視アカウント」にだけ置く。設定シートの初期値は空にしてあり、
`app-check.yml` が書き戻されていないかを毎回確かめる。

実測値（保存数の分布、投稿頻度、費用）は**数字だけ**を文書に残した。
どのアカウントを見て得た数字かは書いていない。

### 未確定の論点

**追跡 4 日で足りているかは分かっていない。** 4 日で打ち切る以上、
5 日目以降の値は原理的に観測できない。判断の材料と手順は
[ADR-0003](docs/50-adr/adr-0003-tracking-window.md) の「見直しの条件」にある。
