# 開発の流れ

**開発の流れは、[docs/00-meta/dev-flow.md](docs/00-meta/dev-flow.md)（META-05）に書いてある。**

このファイルは、GitHubのための入口である。issueとPRの作成画面に自動でリンクが出るので置いてあるが、中身は持たない。2か所に同じことを書くと、どちらかが必ず古くなる。

読む順番は、次の4つである。

| 順 | 文書 | 書いてあること |
| --- | --- | --- |
| 1 | [docs/00-meta/dev-flow.md](docs/00-meta/dev-flow.md) | いつ何をするか。`/grill`を回す4つの場面もここにある |
| 2 | [docs/00-meta/issue-pr-flow.md](docs/00-meta/issue-pr-flow.md) | issueの型、決まったことの移し先、PRの粒度 |
| 3 | [docs/00-meta/implementation-layout.md](docs/00-meta/implementation-layout.md) | 実装の置き場と`implemented_by` |
| 4 | [docs/00-meta/graph-rules.md](docs/00-meta/graph-rules.md) | 文書を書くときの規約と、ルールID |

出す前に、次のコマンドが通ることを確かめる。

```bash
python -m tools.graph check
```
