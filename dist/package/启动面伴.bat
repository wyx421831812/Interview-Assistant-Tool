@echo off
chcp 65001 >nul
title 面伴 · AI 面试辅助
cd /d "%~dp0"

set PYCMD=
where python >nul 2>nul && set PYCMD=python
if not defined PYCMD where py >nul 2>nul && set PYCMD=py

if not defined PYCMD (
  echo [提示] 未检测到 Python，将以纯网页模式直接打开。
  echo 火山方舟等不支持浏览器直连的服务将无法调用，建议安装 Python 后重新双击本脚本。
  start "" "%~dp0index.html"
  pause
  exit /b
)

echo 正在启动本地服务（关闭本窗口即退出）...
echo 启动后浏览器将自动打开 http://localhost:8787/
start "" /min cmd /c "timeout /t 2 /nobreak >nul & start "" http://localhost:8787/"
%PYCMD% proxy.py
