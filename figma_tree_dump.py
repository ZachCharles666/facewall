#!/usr/bin/env python3
"""
Figma 整棵子树导出脚本
======================

用途：只传一个根节点 id（比如外层 Frame 15 = 116:776），
自动把它底下所有子孙节点连同层级关系、以及每个节点的关键设计属性
一次性导出，不用逐个手动复制子图层的链接。

依赖：
    pip install requests

用法：
    export FIGMA_TOKEN=你的personal_access_token   # PowerShell 用 $env:FIGMA_TOKEN="..."

    python figma_tree_dump.py \
        --file-key KHsM48fpnCB2sDEQma4BRZ \
        --node-id 116:776 \
        --out ./figma_tree

输出：
    tree.md    人读版本，按缩进展示层级 + 关键属性，方便你肉眼扫一遍找"哪个是卡片/哪个有颜色"
    tree.json  完整数据，包含每个节点的 path（从根到它的层级路径）
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

FIGMA_API = "https://api.figma.com/v1"


def make_run_tag(node_id: str) -> str:
    """用节点 id + 时间戳拼一个文件名标签，避免不同次运行互相覆盖"""
    safe_id = re.sub(r"[^\w\-]+", "_", node_id.replace(":", "-"))
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{safe_id}_{ts}"


def get_headers(token: str) -> dict:
    return {"X-Figma-Token": token}


def fetch_node_tree(file_key: str, node_id: str, token: str, max_retries: int = 5) -> dict:
    url = f"{FIGMA_API}/files/{file_key}/nodes"
    max_auto_wait_seconds = 300

    for attempt in range(max_retries):
        resp = requests.get(url, headers=get_headers(token), params={"ids": node_id})

        if resp.status_code == 429:
            retry_after = resp.headers.get("Retry-After")
            plan_tier = resp.headers.get("X-Figma-Plan-Tier", "未知")
            limit_type = resp.headers.get("X-Figma-Rate-Limit-Type", "未知")
            upgrade_link = resp.headers.get("X-Figma-Upgrade-Link", "")
            wait = int(retry_after) if retry_after else 15

            print(f"    触发限流(429) — Plan: {plan_tier}, 限流类型: {limit_type}")
            if wait > max_auto_wait_seconds:
                msg = (
                    f"\n限流等待时间过长（Retry-After={wait}秒，约{wait / 3600:.1f}小时），"
                    f"大概率是账号方案（{plan_tier}）或席位类型（{limit_type}）级别的限制，自动重试没有意义。"
                )
                if upgrade_link:
                    msg += f"\n升级链接: {upgrade_link}"
                raise RuntimeError(msg)

            print(f"    等待 {wait} 秒后重试 ({attempt + 1}/{max_retries}) ...")
            time.sleep(wait)
            continue

        resp.raise_for_status()
        data = resp.json()
        node_data = data.get("nodes", {}).get(node_id)
        if not node_data:
            raise RuntimeError(f"没找到节点 {node_id}，检查 file-key / node-id / token 权限")
        return node_data["document"]

    raise RuntimeError("重试次数用完，Figma API 仍返回 429，请稍后再试")


def color_to_hex(color: dict) -> str:
    r = round(color.get("r", 0) * 255)
    g = round(color.get("g", 0) * 255)
    b = round(color.get("b", 0) * 255)
    a = color.get("a", 1)
    if a < 1:
        return f"rgba({r}, {g}, {b}, {round(a, 2)})"
    return f"#{r:02X}{g:02X}{b:02X}"


def describe_fills(fills: list) -> str:
    if not fills:
        return ""
    parts = []
    for f in fills:
        if not f.get("visible", True):
            continue
        ftype = f.get("type")
        if ftype == "SOLID":
            parts.append(color_to_hex(f.get("color", {})))
        elif ftype == "IMAGE":
            parts.append("IMAGE_FILL")
        elif ftype:
            parts.append(str(ftype))
    return "; ".join(parts)


def describe_corner_radius(node: dict):
    if "cornerRadius" in node:
        return node["cornerRadius"]
    if "rectangleCornerRadii" in node:
        r = node["rectangleCornerRadii"]
        return f"{r[0]}/{r[1]}/{r[2]}/{r[3]}"
    return None


def describe_effects(effects: list) -> str:
    if not effects:
        return ""
    parts = []
    for e in effects:
        if e.get("visible", True) and e.get("type") in ("DROP_SHADOW", "INNER_SHADOW"):
            parts.append(f"{e['type']}({color_to_hex(e.get('color', {}))})")
    return "; ".join(parts)


def walk(node: dict, path: list, depth: int, out_list: list):
    """递归遍历，记录每个节点的层级路径 path（从根到当前节点的名字列表）"""
    name = node.get("name", "unnamed")
    node_id = node.get("id")
    node_type = node.get("type")
    bbox = node.get("absoluteBoundingBox") or {}

    fill = describe_fills(node.get("fills", []))
    radius = describe_corner_radius(node)
    effects = describe_effects(node.get("effects", []))
    text_sample = node.get("characters", "") if node_type == "TEXT" else ""
    if len(text_sample) > 24:
        text_sample = text_sample[:24] + "..."

    entry = {
        "node_id": node_id,
        "name": name,
        "type": node_type,
        "depth": depth,
        "path": " / ".join(path + [name]),
        "width": round(bbox.get("width", 0), 1) if bbox else None,
        "height": round(bbox.get("height", 0), 1) if bbox else None,
        "fill": fill,
        "corner_radius": radius,
        "effects": effects,
        "text_sample": text_sample,
    }
    out_list.append(entry)

    for child in node.get("children", []) or []:
        walk(child, path + [name], depth + 1, out_list)


def format_markdown(entries: list) -> str:
    lines = ["# Figma 图层树结构\n"]
    lines.append("标记说明：⭐ = 有背景色/圆角/阴影其中至少一项（大概率是你要找的'有配色的卡片/标签'）\n")
    for e in entries:
        indent = "  " * e["depth"]
        has_style = e["fill"] or e["corner_radius"] or e["effects"]
        marker = "⭐ " if has_style else ""
        size = f"{e['width']}x{e['height']}" if e["width"] is not None else "-"
        line = f"{indent}- {marker}**{e['name']}** `({e['node_id']})` [{e['type']}] {size}"
        lines.append(line)
        if has_style:
            style_bits = []
            if e["fill"]:
                style_bits.append(f"fill={e['fill']}")
            if e["corner_radius"] is not None:
                style_bits.append(f"radius={e['corner_radius']}")
            if e["effects"]:
                style_bits.append(f"effects={e['effects']}")
            lines.append(f"{indent}  ↳ {', '.join(style_bits)}")
        if e["text_sample"]:
            lines.append(f"{indent}  ↳ 文字: {e['text_sample']}")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="导出某个根节点下整棵子树的层级与属性")
    parser.add_argument("--file-key", required=True)
    parser.add_argument("--node-id", required=True, help="根节点 id，例如 116:776")
    parser.add_argument("--out", default="./figma_tree")
    args = parser.parse_args()

    token = os.environ.get("FIGMA_TOKEN")
    if not token:
        print("错误：请先设置环境变量 FIGMA_TOKEN", file=sys.stderr)
        sys.exit(1)

    print(f"拉取节点树：{args.node_id} ...")
    root = fetch_node_tree(args.file_key, args.node_id, token)

    entries = []
    walk(root, [], 0, entries)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    run_tag = make_run_tag(args.node_id)
    md_name = f"tree_{run_tag}.md"
    json_name = f"tree_{run_tag}.json"

    md = format_markdown(entries)
    (out_dir / md_name).write_text(md, encoding="utf-8")
    (out_dir / json_name).write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")

    # 额外维护一份不带时间戳的 latest 版本，方便直接引用最新结果
    (out_dir / "tree_latest.md").write_text(md, encoding="utf-8")
    (out_dir / "tree_latest.json").write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")

    starred = sum(1 for e in entries if e["fill"] or e["corner_radius"] is not None or e["effects"])
    print(f"\n共 {len(entries)} 个节点，其中 {starred} 个带背景色/圆角/阴影（标 ⭐ 的）")
    print(f"本次结果: {(out_dir / md_name).resolve()}")
    print(f"          {(out_dir / json_name).resolve()}")
    print(f"最新快捷方式: {(out_dir / 'tree_latest.md').resolve()}")


if __name__ == "__main__":
    main()
