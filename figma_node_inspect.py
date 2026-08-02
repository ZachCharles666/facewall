#!/usr/bin/env python3
"""
Figma 节点属性提取脚本
======================

用途：给定一批 node id，通过 Figma Files API（不走 Dev Mode / 不吃 View seat 额度）
把每个节点的精确设计属性（尺寸、位置、圆角、颜色、描边、阴影、字体、自动布局、
padding、gap）提取出来，按你要的清单格式打印，并额外保存一份 JSON 方便程序化使用。

如果节点是 Component Set（比如一个按钮做了 normal/hover/pressed 三个变体，
或者 Q1/Q2/Q3 tab 做了 active/inactive 变体），会自动把每个变体当作一个"状态"
分别列出。

依赖：
    pip install requests

用法：
    export FIGMA_TOKEN=你的personal_access_token

    python figma_node_inspect.py \
        --file-key KHsM48fpnCB2sDEQma4BRZ \
        --node-ids 116:776,115:760,115:761,115:762,81:662 \
        --frame-id 116:1 \
        --out ./figma_specs

参数说明：
    --file-key   Figma 文件 key
    --node-ids   逗号分隔的节点 id 列表，注意用冒号不是横杠
    --frame-id   可选。用来计算"相对 375x812 frame 的 x/y"，
                 传入外层 Frame 的 node id，脚本会用它的绝对坐标做基准做减法。
                 不传的话就直接输出节点自身的绝对坐标，你自己再减。
    --out        输出目录，会生成 specs.md（人读）和 specs.json（程序读）
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


def make_run_tag(node_ids: list) -> str:
    """
    用节点 id 列表 + 时间戳拼一个文件名标签，避免不同次运行互相覆盖。
    节点太多时只取前 3 个 id 拼名字 + 数量，避免文件名过长。
    """
    safe_ids = [re.sub(r"[^\w\-]+", "_", n.replace(":", "-")) for n in node_ids]
    if len(safe_ids) <= 3:
        id_part = "+".join(safe_ids)
    else:
        id_part = "+".join(safe_ids[:3]) + f"+and{len(safe_ids) - 3}more"
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{id_part}_{ts}"


def get_headers(token: str) -> dict:
    return {"X-Figma-Token": token}


def fetch_nodes(file_key: str, node_ids: list, token: str, max_retries: int = 5) -> dict:
    url = f"{FIGMA_API}/files/{file_key}/nodes"
    max_auto_wait_seconds = 300

    for attempt in range(max_retries):
        resp = requests.get(url, headers=get_headers(token), params={"ids": ",".join(node_ids)})

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
        if "nodes" not in data:
            raise RuntimeError(f"API 返回异常: {data}")
        return data["nodes"]

    raise RuntimeError("重试次数用完，Figma API 仍返回 429，请稍后再试")


def color_to_hex(color: dict) -> str:
    """Figma 的颜色是 0-1 浮点 rgba，转成 #RRGGBB / rgba() 字符串"""
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
            parts.append("IMAGE_FILL(需单独导出图片)")
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
            radius = e.get("radius", 0)
            spread = e.get("spread", 0)
            parts.append(
                f"{etype}(color={color}, x={offset.get('x', 0)}, y={offset.get('y', 0)}, "
                f"blur={radius}, spread={spread})"
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
        radii = node["rectangleCornerRadii"]
        return f"TL={radii[0]} TR={radii[1]} BR={radii[2]} BL={radii[3]}"
    return "无"


def describe_auto_layout(node: dict) -> dict:
    mode = node.get("layoutMode", "NONE")
    if mode == "NONE":
        return {"auto_layout": "无", "padding": "-", "gap": "-"}
    padding = (
        f"top={node.get('paddingTop', 0)} right={node.get('paddingRight', 0)} "
        f"bottom={node.get('paddingBottom', 0)} left={node.get('paddingLeft', 0)}"
    )
    return {
        "auto_layout": f"{mode}, primary_align={node.get('primaryAxisAlignItems', '?')}, "
        f"counter_align={node.get('counterAxisAlignItems', '?')}",
        "padding": padding,
        "gap": node.get("itemSpacing", 0),
    }


def find_first_text_style(node: dict):
    """节点自身是文字就用自己的样式，否则递归找第一个文字子节点的样式"""
    if node.get("type") == "TEXT" and "style" in node:
        return node["style"], node.get("characters", "")
    for child in node.get("children", []) or []:
        result = find_first_text_style(child)
        if result:
            return result
    return None


def describe_text_style(node: dict) -> dict:
    result = find_first_text_style(node)
    if not result:
        return {
            "font_family": "-", "font_size": "-", "font_weight": "-",
            "line_height": "-", "letter_spacing": "-", "text_sample": "-",
        }
    style, characters = result
    line_height = style.get("lineHeightPx")
    if line_height is None and style.get("lineHeightPercentFontSize"):
        line_height = f"{style['lineHeightPercentFontSize']}%"
    return {
        "font_family": style.get("fontFamily", "-"),
        "font_size": style.get("fontSize", "-"),
        "font_weight": style.get("fontWeight", "-"),
        "line_height": line_height if line_height is not None else "-",
        "letter_spacing": style.get("letterSpacing", "-"),
        "text_sample": (characters[:20] + "...") if len(characters) > 20 else characters,
    }


def get_relative_pos(node: dict, frame_bbox: dict):
    bbox = node.get("absoluteBoundingBox") or {}
    if not bbox:
        return "-", "-"
    if frame_bbox:
        x = round(bbox.get("x", 0) - frame_bbox.get("x", 0), 1)
        y = round(bbox.get("y", 0) - frame_bbox.get("y", 0), 1)
    else:
        x = round(bbox.get("x", 0), 1)
        y = round(bbox.get("y", 0), 1)
    return x, y


def extract_spec(node: dict, frame_bbox: dict) -> dict:
    bbox = node.get("absoluteBoundingBox") or {}
    x, y = get_relative_pos(node, frame_bbox)
    auto_layout = describe_auto_layout(node)
    text_style = describe_text_style(node)

    spec = {
        "node_id": node.get("id"),
        "name": node.get("name"),
        "type": node.get("type"),
        "x": x,
        "y": y,
        "width": round(bbox.get("width", 0), 1),
        "height": round(bbox.get("height", 0), 1),
        "corner_radius": describe_corner_radius(node),
        "fill": describe_fills(node.get("fills", [])),
        "stroke": describe_strokes(node),
        "effects": describe_effects(node.get("effects", [])),
        **auto_layout,
        **text_style,
    }
    return spec


def extract_node_and_variants(node: dict, frame_bbox: dict) -> list:
    """
    如果是 COMPONENT_SET（比如按钮/tab 做了多个变体状态），
    把每个变体子节点都当作一个状态分别提取；否则就提取自身。
    """
    specs = []
    if node.get("type") == "COMPONENT_SET" and node.get("children"):
        for variant in node["children"]:
            spec = extract_spec(variant, frame_bbox)
            spec["variant_name"] = variant.get("name")  # 例如 "State=Hover"
            specs.append(spec)
    else:
        specs.append(extract_spec(node, frame_bbox))
    return specs


def format_markdown(all_specs: list) -> str:
    lines = ["# Figma 节点设计属性清单\n"]
    for group in all_specs:
        lines.append(f"## {group['name']} (`{group['node_id']}`)\n")
        for spec in group["specs"]:
            title = spec.get("variant_name", spec["name"])
            lines.append(f"### {title}")
            lines.append(f"```")
            lines.append(f"node-id: {spec['node_id']}")
            lines.append(f"节点名称: {spec['name']}")
            lines.append(f"x/y: {spec['x']} / {spec['y']}")
            lines.append(f"width/height: {spec['width']} / {spec['height']}")
            lines.append(f"border-radius: {spec['corner_radius']}")
            lines.append(f"fill/background: {spec['fill']}")
            lines.append(f"stroke: {spec['stroke']}")
            lines.append(f"shadow/effects: {spec['effects']}")
            lines.append(f"font-family: {spec['font_family']}")
            lines.append(f"font-size: {spec['font_size']}")
            lines.append(f"font-weight: {spec['font_weight']}")
            lines.append(f"line-height: {spec['line_height']}")
            lines.append(f"letter-spacing: {spec['letter_spacing']}")
            lines.append(f"auto-layout: {spec['auto_layout']}")
            lines.append(f"padding: {spec['padding']}")
            lines.append(f"gap: {spec['gap']}")
            if spec.get("text_sample") and spec["text_sample"] != "-":
                lines.append(f"文字样例: {spec['text_sample']}")
            lines.append("```\n")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="提取 Figma 节点的精确设计属性")
    parser.add_argument("--file-key", required=True)
    parser.add_argument("--node-ids", required=True, help="逗号分隔，例如 116:776,115:760,81:662")
    parser.add_argument("--frame-id", default=None, help="外层参照 Frame 的 node id，用来算相对坐标")
    parser.add_argument("--out", default="./figma_specs")
    args = parser.parse_args()

    token = os.environ.get("FIGMA_TOKEN")
    if not token:
        print("错误：请先设置环境变量 FIGMA_TOKEN", file=sys.stderr)
        sys.exit(1)

    node_ids = [n.strip() for n in args.node_ids.split(",")]
    fetch_ids = list(node_ids)
    if args.frame_id and args.frame_id not in fetch_ids:
        fetch_ids.append(args.frame_id)

    print(f"[1/2] 拉取 {len(fetch_ids)} 个节点数据 ...")
    nodes_data = fetch_nodes(args.file_key, fetch_ids, token)

    frame_bbox = None
    if args.frame_id:
        frame_node = nodes_data.get(args.frame_id, {}).get("document", {})
        frame_bbox = frame_node.get("absoluteBoundingBox")
        if not frame_bbox:
            print(f"    警告：frame-id {args.frame_id} 没有找到有效坐标，改用绝对坐标输出")

    print("[2/2] 提取属性 ...")
    all_specs = []
    for nid in node_ids:
        entry = nodes_data.get(nid)
        if not entry:
            print(f"    跳过（未找到节点）: {nid}")
            continue
        doc = entry["document"]
        specs = extract_node_and_variants(doc, frame_bbox)
        all_specs.append({"node_id": nid, "name": doc.get("name"), "specs": specs})
        print(f"    OK: {doc.get('name')} ({nid}) - {len(specs)} 个状态/变体")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    run_tag = make_run_tag(node_ids)
    md_name = f"specs_{run_tag}.md"
    json_name = f"specs_{run_tag}.json"

    md_content = format_markdown(all_specs)
    (out_dir / md_name).write_text(md_content, encoding="utf-8")
    (out_dir / json_name).write_text(
        json.dumps(all_specs, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # 额外维护一份不带时间戳的 latest 版本，方便直接引用最新结果
    (out_dir / "specs_latest.md").write_text(md_content, encoding="utf-8")
    (out_dir / "specs_latest.json").write_text(
        json.dumps(all_specs, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"\n完成。")
    print(f"本次结果: {(out_dir / md_name).resolve()}")
    print(f"          {(out_dir / json_name).resolve()}")
    print(f"最新快捷方式: {(out_dir / 'specs_latest.md').resolve()}")


if __name__ == "__main__":
    main()
