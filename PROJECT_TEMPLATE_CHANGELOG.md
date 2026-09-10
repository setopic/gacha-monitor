# graph-project-template の変更履歴

**この層だけの履歴。** 履歴は 3 つに分かれており、**それぞれ持ち主が違う。**

| ファイル | 誰の履歴か | 派生への流れ方 |
| --- | --- | --- |
| [TEMPLATE_CHANGELOG.md](TEMPLATE_CHANGELOG.md) | `graph-doc-template`（検証ツール） | 下流すべてに流れる |
| **このファイル** | `graph-project-template`（統合型の層） | その派生に流れる |
| [PROJECT_CHANGELOG.md](PROJECT_CHANGELOG.md) | **そのプロジェクト自身** | **流れない**（`merge=ours`） |

**派生プロジェクトはこのファイルを書き換えない。** 自分の履歴は
`PROJECT_CHANGELOG.md` に書く。

現在の版: **0.4.0**

---

## 0.4.0 — 2026-09-10

**履歴のファイル名を層ごとに分けた。**

### 何が起きていたか

このファイルはもともと `PROJECT_CHANGELOG.md` という名前だった。
ところが**派生プロジェクトも同じ名前で自分の履歴を書こうとする。**
名前が 1 つで所有者が 2 人いる状態で、取り込むたびに派生側が上書きされる。

実際、統合型の派生 2 件（`tournament-docs` / `medieval-idle-docs`）は
**自分の履歴を 1 行も持たないまま、この層の履歴をそのまま抱えていた。**

### 決めたこと

- この層の履歴を `PROJECT_TEMPLATE_CHANGELOG.md` に改名した
- `PROJECT_CHANGELOG.md` は**プロジェクト自身のもの**とし、雛形だけを配る
- 上流（1.10.0）の `.gitattributes` が `PROJECT_CHANGELOG.md merge=ours` を持つ

### 取り込む側の作業

**`PROJECT_CHANGELOG.md` に、この層の履歴（「graph-project-template の変更履歴」
で始まるもの）が入っているなら、中身を自分の履歴に書き換える。**
以後は上書きされない。この層の履歴は `PROJECT_TEMPLATE_CHANGELOG.md` で読む。

---

## 0.3.0 — 2026-09-10

### 上流

`graph-doc-template` 1.9.0 を取り込んだ（`G018` と `render --aggregate`）。

**この層で足すものは無い。** 統合型に固有の事情は無く、文書だけの型と同じように効く。

**派生プロジェクトに伝えること。** `G018` は新しいエラーなので、README の図が
既に GitHub の描画上限（エッジ 500 本）に達しているリポジトリは、取り込んだ時点で
main の CI が落ちる。落ちるのは正しく、その README の図は**取り込む前から
GitHub 上で描画されていない**。直し方は `TEMPLATE_CHANGELOG.md` の 1.9.0 にある。

## 0.2.0 — 2026-09-08

### 追加

**`CLAUDE.md` に「実装を書くときの決まり」を足した。**

- **モジュールの説明の 1 行目に、規定しているノードの id を書く。**
  これが `implemented_by` の根拠になる。実プロジェクトではこの 1 行のおかげで
  対応を推測せずに起こせた（tournament 95% / medieval-idle 100%）
- **識別子はドメインの正式な用語を使う。**`G013` はコードに届かないので、
  機械では確かめられない。書くときに合わせる
- **コメントには「なぜやらなかったか」を書く。**
  長くなるならそれは ADR に書くべきもの

記事（[keitakn/engineering-skills](https://github.com/keitakn/engineering-skills)）の
`code-naming` / `code-comments` に相当するものだが、**汎用のガイドは入れていない。**
このプロジェクトには用語表という具体的な正解があり、汎用の命名論より強い。

### 上流

`graph-doc-template` 1.8.0 を取り込んだ（`/grill` スキル）。

---

## 0.1.1 — 2026-09-07

### 直したもの

- **`CLAUDE.md` の `implemented_by` の例が根からのパスだと読めなかった。**
  `- tournament/teams.py` とだけ書いてあり、**どこからのパスかを言っていなかった。**
  実装を `app/` の下に置いた派生（tournament / medieval-idle のどちらもそうしている）で
  そのまま真似すると、指し先が無いので **`G016` がエラーになる。**
  例を `app/tournament/teams.py` に変え、**根からのパスであること**と、
  **先頭のディレクトリ名はテンプレートが決めていないこと**（[META-04](docs/00-meta/implementation-layout.md)）を書き足した。
  **`app/` を規約にしたわけではない。**0.1.0 の「足さなかったもの」のとおり、
  実装のディレクトリ名は自由なままである

### 変えていないもの

- **`docs/00-meta/graph-rules.md` の同じ例。**あちらは上流（`graph-doc-template`）と
  共通のファイルで、**文書だけの型には `app/` が無い。**
  こちらで直すと次の `git merge template/main` で競合する

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
