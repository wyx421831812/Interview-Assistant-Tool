#!/usr/bin/env python3
"""
本地代理服务器 —— 解决浏览器端调用 LLM API 的 CORS 问题。

功能：
  1. 静态文件托管（默认在 http://localhost:8787 直接打开前端）
  2. 转发所有 `/proxy/*` 请求到目标 API，自动添加 CORS 响应头

使用：
  python3 proxy.py          # 默认端口 8787
  python3 proxy.py 8080     # 指定端口

前端 Base URL 配置为：http://localhost:8787/proxy/<原BaseURL>
例如：
  原地址：https://ark.cn-beijing.volces.com/api/v3
  配置为：http://localhost:8787/proxy/https://ark.cn-beijing.volces.com/api/v3
"""

import sys
import json
import urllib.request
import urllib.error
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).parent.resolve()
PROXY_PREFIX = "/proxy/"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key, anthropic-version")
        self.send_header("Access-Control-Expose-Headers", "*")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith(PROXY_PREFIX):
            self._proxy("GET")
            return
        if self.path == "/" or self.path == "":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        if self.path.startswith(PROXY_PREFIX):
            self._proxy("POST")
            return
        self.send_error(404, "Not Found")

    def do_PUT(self):
        if self.path.startswith(PROXY_PREFIX):
            self._proxy("PUT")
            return
        self.send_error(404, "Not Found")

    def do_DELETE(self):
        if self.path.startswith(PROXY_PREFIX):
            self._proxy("DELETE")
            return
        self.send_error(404, "Not Found")

    def _proxy(self, method):
        target = self.path[len(PROXY_PREFIX):]
        if not target.startswith("http://") and not target.startswith("https://"):
            target = "https://" + target

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else None

        headers = {}
        for h in ("Content-Type", "Authorization", "x-api-key", "anthropic-version",
                   "Accept", "OpenAI-Organization", "OpenAI-Project"):
            v = self.headers.get(h)
            if v:
                headers[h] = v

        req = urllib.request.Request(target, data=body, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                resp_body = resp.read()
                self.send_response(resp.status)
                ctype = resp.headers.get("Content-Type", "application/json")
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(resp_body)))
                self.end_headers()
                self.wfile.write(resp_body)
        except urllib.error.HTTPError as e:
            resp_body = e.read()
            self.send_response(e.code)
            ctype = e.headers.get("Content-Type", "application/json")
            self.send_header("Content-Type", ctype)
            self.end_headers()
            self.wfile.write(resp_body)
        except Exception as e:
            err = json.dumps({"error": {"message": str(e), "type": "proxy_error"}}).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(err)

    def log_message(self, format, *args):
        # 简化日志
        print(f"[{self.log_date_time_string()}] {format % args}")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    server = HTTPServer(("0.0.0.0", port), Handler)
    print(f"=" * 60)
    print(f"  面伴 · 本地代理服务器已启动")
    print(f"  前端地址: http://localhost:{port}/")
    print(f"  代理前缀: http://localhost:{port}/proxy/<目标API地址>")
    print(f"=" * 60)
    print(f"  示例 Base URL 配置：")
    print(f"    火山方舟: http://localhost:{port}/proxy/https://ark.cn-beijing.volces.com/api/v3")
    print(f"    DeepSeek: http://localhost:{port}/proxy/https://api.deepseek.com/v1")
    print(f"=" * 60)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
        server.server_close()


if __name__ == "__main__":
    main()
