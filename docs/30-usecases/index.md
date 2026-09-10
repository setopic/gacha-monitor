---
id: IDX-UC
type: index
title: ユースケース
status: stable
tags: [index]
---

# ユースケース（層 30）

誰が、何をして、何が起きるか。**事後条件はドメインの用語だけで書く。**

`depends_on` には、そのユースケースが前提とするドメインノードを挙げる。
ここが空のユースケースは、扱っている概念が定義されていないということ。

## ノード一覧

<!-- graph:children:start -->
- [UC-01 注目商品を検知して通知する](./uc-01-detect-and-notify.md)
- [UC-02 週次サマリーを送る](./uc-02-weekly-summary.md)
- [UC-03 異常と予算超過を知らせる](./uc-03-alert-anomaly.md)
<!-- graph:children:end -->

## 追加するとき

```bash
python -m tools.graph new --type usecase --id UC-02 --title "..." --slug some-slug
```
