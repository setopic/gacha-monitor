# 開発の流れ

**正本は [docs/00-meta/dev-flow.md](docs/00-meta/dev-flow.md)（META-05）にある。**

このファイルは GitHub のための入口である。issue と PR の作成画面に
自動でリンクが出るので置いてあるが、**中身は持たない。**
2 か所に同じことを書くと、どちらかが必ず古くなる。

読む順番はこの 3 つ。

1. [docs/00-meta/dev-flow.md](docs/00-meta/dev-flow.md) — いつ何をするか。**`/grill` を回す 4 つの場面**もここ
2. [docs/00-meta/implementation-layout.md](docs/00-meta/implementation-layout.md) — 決まったことをどこに書くか
3. [docs/00-meta/graph-rules.md](docs/00-meta/graph-rules.md) — 文書を書くときの規約とルール ID

出す前に、これが通ること。

```bash
python -m tools.graph check
```
