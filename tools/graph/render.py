"""グラフを Mermaid / JSON / DOT に書き出す。"""

from __future__ import annotations

import json
import re
from pathlib import Path

from . import schema
from .model import Graph

DIAGRAM_BLOCK_RE = re.compile(
    re.escape(schema.DIAGRAM_BLOCK_START) + r".*?" + re.escape(schema.DIAGRAM_BLOCK_END),
    re.DOTALL,
)

_ARROW = {
    "refines": "-->",
    "depends_on": "-->",
    "related": "-.->",
    "supersedes": "==>",
    "decides": "-.->",
    schema.BODY_EDGE_KIND: "-.->",
}


def _edges(graph: Graph, include_mentions: bool):
    seen: set[tuple[str, str, str]] = set()
    for node in graph.sorted_nodes():
        for edge in node.edges:
            if not edge.resolved:
                continue
            if edge.kind == schema.BODY_EDGE_KIND and not include_mentions:
                continue
            key = (edge.src, edge.dst, edge.kind)
            if key in seen:
                continue
            seen.add(key)
            yield edge


def _escape(text: str) -> str:
    return text.replace('"', "'").replace("\n", " ")


def to_mermaid(
    graph: Graph,
    include_mentions: bool = False,
    focus: set[str] | None = None,
) -> str:
    lines = ["graph LR"]

    for type_name, spec in schema.NODE_TYPES.items():
        nodes = graph.by_type(type_name)
        if not nodes:
            continue
        lines.append(f'  subgraph {type_name}["{spec["label"]}"]')
        for node in nodes:
            lines.append(f'    {node.id}["{_escape(node.id)}<br/>{_escape(node.title)}"]')
        lines.append("  end")

    for edge in _edges(graph, include_mentions):
        arrow = _ARROW.get(edge.kind, "-->")
        lines.append(f"  {edge.src} {arrow}|{edge.kind}| {edge.dst}")

    # status で色を分ける
    draft = [n.id for n in graph.sorted_nodes() if n.status == "draft"]
    deprecated = [n.id for n in graph.sorted_nodes() if n.status == "deprecated"]
    # mermaid の style 定義はカンマ区切りなので、値に含めるカンマは \, と書く。
    # 空白区切り（"4 3"）は仕様として定義されておらず、描画されないことがある。
    lines.append("  classDef draft stroke-dasharray: 4\\,3;")
    lines.append("  classDef deprecated opacity:0.5;")
    if draft:
        lines.append(f"  class {','.join(draft)} draft;")
    if deprecated:
        lines.append(f"  class {','.join(deprecated)} deprecated;")

    if focus:
        marked = [n.id for n in graph.sorted_nodes() if n.id in focus]
        if marked:
            lines.append("  classDef focus stroke-width:3px;")
            lines.append(f"  class {','.join(marked)} focus;")

    return "\n".join(lines) + "\n"


def to_mermaid_aggregate(graph: Graph, include_mentions: bool = False) -> str:
    """型ごとに 1 つの箱へまとめた図を書き出す。

    ノードが何件あっても箱は型の数だけ、エッジは「型 × 種別 × 型」の組み合わせ
    だけになる。**ノードが増えても図は大きくならない**ので、GitHub の描画上限
    （エッジ 500 本 / G018）に当たらない。

    引き換えに**個別のノードは見えなくなる。** 上限に近づいたリポジトリだけで
    使うこと。小さいリポジトリで使うと、縮む余地が無いまま情報だけ失う。
    """
    lines = ["graph LR"]

    present = [
        (spec, graph.by_type(name)) for name, spec in schema.NODE_TYPES.items()
    ]
    present = [(spec, nodes) for spec, nodes in present if nodes]

    for spec, nodes in present:
        label = _escape(spec["label"])
        lines.append(f'  {spec["prefix"]}["{label}<br/>{len(nodes)} 件"]')

    # (始点の型, 種別, 終点の型) ごとに本数を数える
    totals: dict[tuple[str, str, str], int] = {}
    for edge in _edges(graph, include_mentions):
        src = graph.nodes.get(edge.src)
        dst = graph.nodes.get(edge.dst)
        if src is None or dst is None:
            continue
        if src.type not in schema.NODE_TYPES or dst.type not in schema.NODE_TYPES:
            continue  # 型の誤りは G003 が言う。ここでは黙って飛ばす
        key = (src.type, edge.kind, dst.type)
        totals[key] = totals.get(key, 0) + 1

    # 本数の多い順。同数なら組み合わせ名の順にして、出力を安定させる
    for (src_type, kind, dst_type), count in sorted(
        totals.items(), key=lambda item: (-item[1], item[0])
    ):
        arrow = _ARROW.get(kind, "-->")
        src_prefix = schema.NODE_TYPES[src_type]["prefix"]
        dst_prefix = schema.NODE_TYPES[dst_type]["prefix"]
        lines.append(f"  {src_prefix} {arrow}|{kind} {count}| {dst_prefix}")

    return "\n".join(lines) + "\n"


# 図の中でエッジを表している行。`A --> B` / `A -.-> B` / `A ==> B` に当たる。
EDGE_LINE_RE = re.compile(r"^\s*[A-Za-z][\w-]*\s+(?:-->|-\.->|==>)")


def count_edges_in_markdown(path: Path) -> int | None:
    """Markdown のマーカー内にある図の、エッジの本数を数える。

    **グラフからではなく、書き込まれた図そのものを数える。** そうしないと
    `--aggregate` や `--focus` で間引いている場合に実態とずれる。GitHub が
    描こうとするのは、あくまで README に入っている図だから。

    マーカーが無い、またはファイルが無ければ None を返す（数えようがない）。
    """
    if not path.is_file():
        return None
    match = DIAGRAM_BLOCK_RE.search(path.read_text(encoding="utf-8"))
    if not match:
        return None
    return sum(1 for line in match.group(0).splitlines() if EDGE_LINE_RE.match(line))


def to_json(graph: Graph, include_mentions: bool = True) -> str:
    payload = {
        "nodes": [
            {
                "id": n.id,
                "type": n.type,
                "title": n.title,
                "status": n.status,
                "tags": n.tags,
                "path": n.rel,
            }
            for n in graph.sorted_nodes()
        ],
        "edges": [
            {"src": e.src, "dst": e.dst, "kind": e.kind, "origin": e.origin}
            for e in _edges(graph, include_mentions)
        ],
    }
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def to_dot(graph: Graph, include_mentions: bool = False) -> str:
    lines = ["digraph docs {", "  rankdir=LR;", '  node [shape=box, fontname="sans-serif"];']
    for node in graph.sorted_nodes():
        lines.append(f'  "{node.id}" [label="{_escape(node.id)}\\n{_escape(node.title)}"];')
    for edge in _edges(graph, include_mentions):
        lines.append(f'  "{edge.src}" -> "{edge.dst}" [label="{edge.kind}"];')
    lines.append("}")
    return "\n".join(lines) + "\n"


class InjectError(RuntimeError):
    pass


def inject(path: Path, diagram: str, *, dry_run: bool = False) -> bool:
    """マーカーで囲まれた範囲に図を書き込む。更新が必要なら True。

    README に図を貼ると必ず腐るので、`sync` と同じくマーカー方式にして
    CI で最新かどうかを検証できるようにする。
    """
    if not path.is_file():
        raise InjectError(f"ファイルがありません: {path}")

    original = path.read_text(encoding="utf-8")
    if not DIAGRAM_BLOCK_RE.search(original):
        raise InjectError(
            f"{path.name} に書き込み先がありません。"
            f"次の 2 行を並べて置いてください:\n"
            f"  {schema.DIAGRAM_BLOCK_START}\n  {schema.DIAGRAM_BLOCK_END}"
        )

    block = "\n".join(
        [
            schema.DIAGRAM_BLOCK_START,
            "",
            "<!-- この図は render --into が生成する。手で編集しない -->",
            "",
            "```mermaid",
            diagram.rstrip("\n"),
            "```",
            "",
            schema.DIAGRAM_BLOCK_END,
        ]
    )

    updated = DIAGRAM_BLOCK_RE.sub(lambda _: block, original, count=1)
    if updated == original:
        return False

    if not dry_run:
        path.write_text(updated, encoding="utf-8", newline="\n")
    return True


def summary(graph: Graph) -> str:
    lines = ["ノード数:"]
    for type_name, spec in schema.NODE_TYPES.items():
        nodes = graph.by_type(type_name)
        if nodes:
            lines.append(f"  {spec['label']:<16} {len(nodes):>3}")

    kinds: dict[str, int] = {}
    for edge in graph.edges():
        if edge.resolved:
            kinds[edge.kind] = kinds.get(edge.kind, 0) + 1
    lines.append("エッジ数:")
    for kind, count in sorted(kinds.items()):
        lines.append(f"  {kind:<16} {count:>3}")

    statuses: dict[str, int] = {}
    for node in graph.sorted_nodes():
        statuses[node.status] = statuses.get(node.status, 0) + 1
    lines.append("status:")
    for status in schema.STATUSES:
        if status in statuses:
            lines.append(f"  {status:<16} {statuses[status]:>3}")

    return "\n".join(lines) + "\n"
