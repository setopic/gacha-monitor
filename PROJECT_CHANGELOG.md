# このプロジェクトの変更履歴

このファイルは、このプロジェクト自身の履歴である。テンプレートは雛形を1回配るだけで、以後の取り込み（`make update`）では上書きしない（`.gitattributes`の`merge=ours`）。最初に、この説明ごと自分の内容に書き換える。

`git merge template/main`を直接使うと、`merge=ours`が使われず、このファイルが雛形と競合することがある。取り込みの手順は[META-08](docs/00-meta/template-upgrade.md)にある。

履歴は3つに分かれており、それぞれ持ち主が違う。

| ファイル | 誰の履歴か | 取り込みで流れてくるか |
| --- | --- | --- |
| [TEMPLATE_CHANGELOG.md](TEMPLATE_CHANGELOG.md) | `graph-doc-template`（検証ツール） | 流れてくる |
| [PROJECT_TEMPLATE_CHANGELOG.md](PROJECT_TEMPLATE_CHANGELOG.md) | `graph-project-template`（統合型の層） | 流れてくる |
| このファイル | このプロジェクト自身 | 流れてこない |

上流の版を上げるときは、このファイルを書き換えない。上流の版は、`tools/graph/version.py`と`tools/graph/layers/graph-project-template.toml`が持つ。

---

## 0.1.0（YYYY-MM-DD）

最初の版。

### 追加

（何を作ったか。決定の理由はADRに書き、ここには何が変わったかを残す）

### 未確定の論点

（分かっていないことを、分かっていないと書く。運用してから判断することを残す）
