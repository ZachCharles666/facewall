#!/usr/bin/env python3
"""
Figma 批量素材导出脚本
======================

用途：给定一个 Figma 文件 key 和根节点 id（比如 Frame/Page），
递归扫描其下所有图层，把符合条件的图层（矢量图标、图片填充、指定类型等）
批量导出为 SVG / PNG 文件，保存到本地目录，方便直接喂给 AI 编码工具当素材用。

依赖：
    pip install requests

用法示例：
    export FIGMA_TOKEN=你的personal_access_token

    python figma_batch_export.py \
        --file-key KHsM48fpnCB2sDEQma4BRZ \
        --node-id 49:483 \
        --out ./assets/wallfacer \
        --format svg \
        --scale 2

参数说明：
    --file-key   Figma 链接里 /design/<FILE_KEY>/ 那一段
    --node-id    起始节点 id，注意把 URL 里的 "49-483" 改成 "49:483"（把横杠换成冒号）
    --out        导出文件保存目录（会自动创建）
    --format     svg / png / jpg / pdf，图标类推荐 svg，插画/贴图推荐 png
    --scale      仅对 png/jpg 生效，2 或 3 比较适合高分屏
    --types      只导出这些类型的图层，默认 VECTOR,COMPONENT,INSTANCE,IMAGE,FRAME
                 如果发现漏导出了什么，把对应类型加进来即可
    --min-size   忽略过小的图层（比如 1x1 的辅助线），单位像素，默认 4
"""

import argparse
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

FIGMA_API = "https://api.figma.com/v1"


def make_run_tag(node_id: str) -> str:
    """用根节点 id + 时间戳拼一个标签，用来给这次运行的 manifest 命名，避免覆盖"""
    safe_id = re.sub(r"[^\w\-]+", "_", node_id.replace(":", "-"))
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{safe_id}_{ts}"


def get_headers(token: str) -> dict:
    return {"X-Figma-Token": token}


def sanitize_filename(name: str, node_id: str, run_tag: str) -> str:
    """把图层名转成安全的文件名，重名时用 node_id + 本次运行时间戳兜底防止覆盖"""
    safe = re.sub(r"[^\w\-\u4e00-\u9fff]+", "_", name).strip("_")
    if not safe:
        safe = "layer"
    return f"{safe}__{node_id.replace(':', '-')}__{run_tag}"


def _handle_rate_limit(resp, attempt: int, max_auto_wait_seconds: int = 300):
    """
    统一处理429响应：打印诊断信息，返回应该等待的秒数；
    如果等待时间过长（大概率是账号方案/席位级限制），直接抛错不再自动重试。
    """
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
    return wait


def fetch_node_tree(file_key: str, node_id: str, token: str, max_retries: int = 5) -> dict:
    """拉取指定节点及其所有子节点的结构"""
    url = f"{FIGMA_API}/files/{file_key}/nodes"
    for attempt in range(max_retries):
        resp = requests.get(url, headers=get_headers(token), params={"ids": node_id})
        if resp.status_code == 429:
            wait = _handle_rate_limit(resp, attempt)
            print(f"    等待 {wait} 秒后重试 ({attempt + 1}/{max_retries}) ...")
            time.sleep(wait)
            continue
        resp.raise_for_status()
        data = resp.json()
        node_data = data.get("nodes", {}).get(node_id)
        if not node_data:
            raise RuntimeError(f"没找到节点 {node_id}，检查 file-key / node-id 是否正确，以及 token 是否有权限访问该文件")
        return node_data["document"]
    raise RuntimeError("重试次数用完，Figma API 仍返回 429，请稍后再试")


def collect_exportable_nodes(node: dict, target_types: set, min_size: float, collected: list):
    """递归遍历图层树，收集符合条件的节点"""
    node_type = node.get("type")
    bbox = node.get("absoluteBoundingBox") or {}
    width = bbox.get("width", 0)
    height = bbox.get("height", 0)

    if node_type in target_types and width >= min_size and height >= min_size:
        collected.append({
            "id": node["id"],
            "name": node.get("name", "unnamed"),
            "type": node_type,
        })
        # 命中就不再往下钻取子节点，避免同一张图导出重复的父子层
        # 如果你想要更细粒度（连子图标也单独导出），把下面这行注释掉
        return

    for child in node.get("children", []) or []:
        collect_exportable_nodes(child, target_types, min_size, collected)


def batch_get_image_urls(file_key: str, node_ids: list, fmt: str, scale: float, token: str) -> dict:
    """
    调用 images 接口拿到渲染后的下载链接。
    Figma 对单次请求的节点数量有限制，这里按 50 个一批分批请求。
    """
    url = f"{FIGMA_API}/images/{file_key}"
    result = {}
    batch_size = 50
    for i in range(0, len(node_ids), batch_size):
        batch = node_ids[i:i + batch_size]
        params = {"ids": ",".join(batch), "format": fmt}
        if fmt in ("png", "jpg"):
            params["scale"] = scale

        for attempt in range(5):
            resp = requests.get(url, headers=get_headers(token), params=params)
            if resp.status_code == 429:
                wait = _handle_rate_limit(resp, attempt)
                print(f"    等待 {wait} 秒后重试 ({attempt + 1}/5) ...")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            data = resp.json()
            if data.get("err"):
                raise RuntimeError(f"Figma API 报错: {data['err']}")
            result.update(data.get("images", {}))
            break
        else:
            raise RuntimeError("重试次数用完，Figma API 仍返回 429，请稍后再试")

        time.sleep(0.3)  # 简单限速，避免触发 rate limit
    return result


def download_file(url: str, dest: Path):
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    dest.write_bytes(resp.content)


def main():
    parser = argparse.ArgumentParser(description="批量导出 Figma 图层为图片素材")
    parser.add_argument("--file-key", required=True, help="Figma 文件 key")
    parser.add_argument("--node-id", required=True, help="起始节点 id，例如 49:483")
    parser.add_argument("--out", default="./figma_assets", help="导出目录")
    parser.add_argument("--format", default="svg", choices=["svg", "png", "jpg", "pdf"])
    parser.add_argument("--scale", type=float, default=2, help="png/jpg 的导出倍率")
    parser.add_argument(
        "--types",
        default="VECTOR,COMPONENT,INSTANCE,IMAGE,FRAME,GROUP",
        help="逗号分隔的图层类型白名单",
    )
    parser.add_argument("--min-size", type=float, default=4, help="忽略小于此尺寸(px)的图层")
    args = parser.parse_args()

    token = os.environ.get("FIGMA_TOKEN")
    if not token:
        print("错误：请先设置环境变量 FIGMA_TOKEN（Figma 个人访问令牌）", file=sys.stderr)
        sys.exit(1)

    target_types = set(t.strip().upper() for t in args.types.split(","))
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[1/4] 拉取节点结构：{args.node_id} ...")
    root_node = fetch_node_tree(args.file_key, args.node_id, token)

    print("[2/4] 递归扫描可导出图层 ...")
    collected = []
    collect_exportable_nodes(root_node, target_types, args.min_size, collected)
    if not collected:
        print("没有找到符合条件的图层，检查 --types 或 --min-size 参数是否太严格")
        return
    print(f"    找到 {len(collected)} 个图层")

    print("[3/4] 请求导出链接 ...")
    node_ids = [c["id"] for c in collected]
    image_urls = batch_get_image_urls(args.file_key, node_ids, args.format, args.scale, token)

    print("[4/4] 下载文件 ...")
    run_tag = make_run_tag(args.node_id)
    manifest = []
    ok, fail = 0, 0
    for c in collected:
        url = image_urls.get(c["id"])
        if not url:
            print(f"    跳过（无有效链接）: {c['name']} ({c['id']})")
            fail += 1
            continue
        filename = sanitize_filename(c["name"], c["id"], run_tag) + f".{args.format}"
        dest = out_dir / filename
        try:
            download_file(url, dest)
            print(f"    OK: {c['name']} -> {dest}")
            manifest.append({"name": c["name"], "type": c["type"], "id": c["id"], "file": filename})
            ok += 1
        except Exception as e:
            print(f"    失败: {c['name']} ({c['id']}) - {e}")
            fail += 1

    # 写一份带时间戳的 manifest，方便 AI 工具知道每个文件对应哪个图层，
    # 同时不覆盖之前跑过的记录
    import json
    manifest_name = f"manifest_{run_tag}.json"
    manifest_path = out_dir / manifest_name
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    # 额外维护一份不带时间戳的 latest 版本
    latest_path = out_dir / "manifest_latest.json"
    latest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n完成：成功 {ok} 个，失败 {fail} 个")
    print(f"素材目录：{out_dir.resolve()}")
    print(f"本次清单：{manifest_path.resolve()}")
    print(f"最新快捷方式：{latest_path.resolve()}（把这个文件路径告诉 AI 工具，它就知道每张图对应哪个图层）")


if __name__ == "__main__":
    main()
