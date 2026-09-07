# graph-project-template の変更履歴

**この層だけの履歴。** 検証ツール（`tools/graph`）の変更は
[TEMPLATE_CHANGELOG.md](TEMPLATE_CHANGELOG.md) にある。上流の
`graph-doc-template` から `git merge template/main` で流れてくる。

現在の版: **0.1.0**

---

## 0.1.0 — 2026-09-07

最初の版。`graph-doc-template` 1.7.0 から起こした。

### 足したもの

- **[META-04](docs/00-meta/implementation-layout.md)** — 文書と実装を同じリポジトリに
  置く理由、置き方、対応の粒度、既にある実装の合流手順
- **`.github/workflows/app-check.yml`** — 実装の検査と、PR が指すノードが実在するかの確認。
  `graph-check.yml` とは別ファイルにして `merge=ours` で守っている。
  **実装のテストを `graph-check.yml` に足すと、テンプレートを取り込むたびに競合する**
- **`.github/scripts/check_refs.py`** — PR 本文のノード id を解決する。
  `なし` と書けば通す
- **`.github/ISSUE_TEMPLATE/requirement.md`** と **`pull_request_template.md`**
- **`.gitignore`** — `.env` と実行時にできるものを除外
- **`CLAUDE.md`** に「文書と実装が同じリポジトリにあるとき」の節

### 足さなかったもの

- **実装計画のファイル。** 受け入れ条件はユースケースが、決定は ADR が持っている。
  3 つ目の文書種別を作ると、同じことを 2 箇所に書くことになる
- **実装のディレクトリ名の規約。** `src/` でも `tournament/` でもよい。
  予約しているのは `docs/` と `tools/graph/` だけ
- **`tools/` への変更。** `implemented_by` と `G016` / `G017` は上流
  （`graph-doc-template` 1.7.0）に入れてある。こちらで書き換えると、
  以後の取り込みで `rules.py` と `schema.py` が競合する
