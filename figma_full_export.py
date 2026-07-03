#!/usr/bin/env python3
"""
Figma 完整规格导出脚本（喂给 Codex 专用）
==========================================

用途：只需一次 Figma API 调用（走普通 Files API，不走 Dev Mode / 不吃 View seat 额度），
把某个根节点（比如 Frame 15 = 116:776）底下所有子孙节点的**完整属性**一次性导出：
    - 层级关系（谁在谁下面）
    - 尺寸、相对坐标
    - 圆角、背景色、描边、阴影
    - auto-layout、padding、gap
    - 字体（family/size/weight/line-height/letter-spacing）
    - 完整文字内容（不截断）

输出一份 full_spec.json + full_spec.md，这一份文件信息量等价于你之前
tree_dump + node_inspect 两个脚本分开跑很多次的总和，而且只需要跑一次。
把这份文件直接丢给 Codex，Codex 不需要再问 Figma 要任何信息。

依赖：
    pip install requests

用法：
    export FIGMA_TOKEN=你的personal_access_token   # PowerShell: $env:FIGMA_TOKEN="..."

    python figma_full_export.py \
        --file-key KHsM48fpnCB2sDEQma4BRZ \
        --node-id 116:776 \
        --out ./figma_full
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
    safe_id = re.sub(r"[^\w\-]+", "_", node_id.replace(":", "-"))
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{safe_id}_{ts}"


def get_headers(token: str) -> dict:
    return {"X-Figma-Token": token}


def fetch_node_tree(file_key: str, node_id: str, token: str, max_retries: int = 5) -> dict:
    url = f"{FIGMA_API}/files/{file_key}/nodes"
    # 超过这个秒数就不自动等了，大概率是 seat/plan 级别的限制而不是短期限流，
    # 等下去可能是好几天，没意义，直接报错让人去看账号情况
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
                # 等待时间过长，大概率是账号方案/席位级别的限制（可能长达数天），
                # 自动重试没有意义，直接把信息报出来让用户自己判断
                msg = (
                    f"\n限流等待时间过长（Retry-After={wait}秒，约{wait / 3600:.1f}小时），"
                    f"这通常不是短期流量限流，而是账号方案（{plan_tier}）或席位类型（{limit_type}）级别的限制，"
                    f"继续自动重试没有意义。"
                )
                if upgrade_link:
                    msg += f"\n升级链接: {upgrade_link}"
                msg += "\n建议：检查 Figma 账号方案，或换一个 token/账号，或等待官方说明的时间窗口后再试。"
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
        return "无"
    parts = []
    for f in fills:
        if not f.get("visible", True):
            continue
        ftype = f.get("type")
        if ftype == "SOLID":
            parts.append(color_to_hex(f.get("color", {})))
        elif ftype and "GRADIENT" in ftype:
            stops = f.get("gradientStops", [])
            stop_desc = " -> ".join(color_to_hex(s.get("color", {})) for s in stops)
            parts.append(f"{ftype}({stop_desc})")
        elif ftype == "IMAGE":
            parts.append("IMAGE_FILL(需单独导出图片，node-id见本条记录)")
        else:
            parts.append(str(ftype))
    return "; ".join(parts) if parts else "无"


def describe_strokes(node: dict) -> str:
    strokes = node.get("strokes", [])
    if not strokes:
        return "无"
    weight = node.get("strokeWeight", "?")
    colors = describe_fills(strokes)
    return f"{colors}, weight={weight}"


def describe_effects(effects: list) -> str:
    if not effects:
        return "无"
    parts = []
    for e in effects:
        if not e.get("visible", True):
            continue
        etype = e.get("type")
        if etype in ("DROP_SHADOW", "INNER_SHADOW"):
            color = color_to_hex(e.get("color", {}))
            offset = e.get("offset", {})
            parts.append(
                f"{etype}(color={color}, x={offset.get('x', 0)}, y={offset.get('y', 0)}, "
                f"blur={e.get('radius', 0)}, spread={e.get('spread', 0)})"
            )
        elif etype in ("LAYER_BLUR", "BACKGROUND_BLUR"):
            parts.append(f"{etype}(radius={e.get('radius', 0)})")
        else:
            parts.append(str(etype))
    return "; ".join(parts) if parts else "无"


def describe_corner_radius(node: dict):
    if "cornerRadius" in node:
        return node["cornerRadius"]
    if "rectangleCornerRadii" in node:
        r = node["rectangleCornerRadii"]
        return f"TL={r[0]} TR={r[1]} BR={r[2]} BL={r[3]}"
    return None


def describe_auto_layout(node: dict) -> dict:
    mode = node.get("layoutMode", "NONE")
    if mode == "NONE":
        return {"auto_layout": "无", "padding": None, "gap": None}
    return {
        "auto_layout": f"{mode}, primary_align={node.get('primaryAxisAlignItems', '?')}, "
        f"counter_align={node.get('counterAxisAlignItems', '?')}",
        "padding": {
            "top": node.get("paddingTop", 0),
            "right": node.get("paddingRight", 0),
            "bottom": node.get("paddingBottom", 0),
            "left": node.get("paddingLeft", 0),
        },
        "gap": node.get("itemSpacing", 0),
    }


def describe_own_text_style(node: dict):
    """只描述节点自身的文字样式（不像之前那样去子节点里找），
    这样每个 TEXT 节点的属性都是它自己的，不会被父节点误抓成子节点的样式"""
    if node.get("type") != "TEXT":
        return None
    style = node.get("style", {})
    line_height = style.get("lineHeightPx")
    if line_height is None and style.get("lineHeightPercentFontSize"):
        line_height = f"{style['lineHeightPercentFontSize']}%"
    return {
        "font_family": style.get("fontFamily"),
        "font_size": style.get("fontSize"),
        "font_weight": style.get("fontWeight"),
        "line_height": line_height,
        "letter_spacing": style.get("letterSpacing"),
        "text_align": style.get("textAlignHorizontal"),
        "full_text": node.get("characters", ""),  # 完整文字，不截断
    }


def get_relative_pos(node: dict, root_bbox: dict):
    bbox = node.get("absoluteBoundingBox") or {}
    if not bbox or not root_bbox:
        return None, None
    x = round(bbox.get("x", 0) - root_bbox.get("x", 0), 1)
    y = round(bbox.get("y", 0) - root_bbox.get("y", 0), 1)
    return x, y


def walk(node: dict, parent_path: list, depth: int, root_bbox: dict, out_list: list):
    name = node.get("name", "unnamed")
    node_id = node.get("id")
    node_type = node.get("type")
    bbox = node.get("absoluteBoundingBox") or {}
    x, y = get_relative_pos(node, root_bbox)
    auto_layout = describe_auto_layout(node)
    text_style = describe_own_text_style(node)

    entry = {
        "node_id": node_id,
        "name": name,
        "type": node_type,
        "depth": depth,
        "path": " / ".join(parent_path + [name]),
        "x_relative_to_root": x,
        "y_relative_to_root": y,
        "width": round(bbox.get("width", 0), 1) if bbox else None,
        "height": round(bbox.get("height", 0), 1) if bbox else None,
        "corner_radius": describe_corner_radius(node),
        "fill": describe_fills(node.get("fills", [])),
        "stroke": describe_strokes(node),
        "effects": describe_effects(node.get("effects", [])),
        "auto_layout": auto_layout["auto_layout"],
        "padding": auto_layout["padding"],
        "gap": auto_layout["gap"],
        "text": text_style,  # None for 非文字节点
    }
    out_list.append(entry)

    for child in node.get("children", []) or []:
        walk(child, parent_path + [name], depth + 1, root_bbox, out_list)


def format_markdown(entries: list, root_name: str) -> str:
    lines = [f"# {root_name} 完整设计规格\n"]
    lines.append("给 Codex 用的完整节点信息，包含层级、样式、文字内容。\n")
    for e in entries:
        indent = "  " * e["depth"]
        lines.append(f"{indent}- **{e['name']}** `({e['node_id']})` [{e['type']}] "
                     f"{e['width']}x{e['height']} @ ({e['x_relative_to_root']}, {e['y_relative_to_root']})")
        details = []
        if e["fill"] and e["fill"] != "无":
            details.append(f"fill={e['fill']}")
        if e["corner_radius"] is not None:
            details.append(f"radius={e['corner_radius']}")
        if e["stroke"] and e["stroke"] != "无":
            details.append(f"stroke={e['stroke']}")
        if e["effects"] and e["effects"] != "无":
            details.append(f"effects={e['effects']}")
        if e["auto_layout"] and e["auto_layout"] != "无":
            details.append(f"layout={e['auto_layout']}")
        if e["padding"]:
            p = e["padding"]
            details.append(f"padding=(t{p['top']} r{p['right']} b{p['bottom']} l{p['left']})")
        if e["gap"] is not None:
            details.append(f"gap={e['gap']}")
        if details:
            lines.append(f"{indent}  ↳ {', '.join(details)}")
        if e["text"]:
            t = e["text"]
            lines.append(
                f"{indent}  ↳ 字体: {t['font_family']} {t['font_size']}px "
                f"weight={t['font_weight']} line-height={t['line_height']} "
                f"letter-spacing={t['letter_spacing']}"
            )
            lines.append(f"{indent}  ↳ 文字: 「{t['full_text']}」")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="一次性导出根节点下所有子孙节点的完整属性")
    parser.add_argument("--file-key", required=True)
    parser.add_argument("--node-id", required=True, help="根节点 id，例如 116:776")
    parser.add_argument("--out", default="./figma_full")
    args = parser.parse_args()

    token = os.environ.get("FIGMA_TOKEN")
    if not token:
        print("错误：请先设置环境变量 FIGMA_TOKEN", file=sys.stderr)
        sys.exit(1)

    print(f"拉取节点树（1次API调用）：{args.node_id} ...")
    root = fetch_node_tree(args.file_key, args.node_id, token)
    root_bbox = root.get("absoluteBoundingBox") or {}

    entries = []
    walk(root, [], 0, root_bbox, entries)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    run_tag = make_run_tag(args.node_id)
    md_name = f"full_spec_{run_tag}.md"
    json_name = f"full_spec_{run_tag}.json"

    md = format_markdown(entries, root.get("name", "root"))
    (out_dir / md_name).write_text(md, encoding="utf-8")
    (out_dir / json_name).write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")

    (out_dir / "full_spec_latest.md").write_text(md, encoding="utf-8")
    (out_dir / "full_spec_latest.json").write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")

    image_fill_nodes = [e for e in entries if "IMAGE_FILL" in (e["fill"] or "")]

    print(f"\n完成：共导出 {len(entries)} 个节点的完整信息（1次 API 调用）")
    print(f"本次结果: {(out_dir / md_name).resolve()}")
    print(f"          {(out_dir / json_name).resolve()}")
    print(f"最新快捷方式: {(out_dir / 'full_spec_latest.md').resolve()}")
    if image_fill_nodes:
        print(f"\n注意：发现 {len(image_fill_nodes)} 个节点用了图片填充，这些不能靠属性还原，需要额外用")
        print("figma_batch_export.py 单独导出图片文件：")
        for n in image_fill_nodes:
            print(f"  - {n['name']} ({n['node_id']})")


if __name__ == "__main__":
    main()
