@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Mail Hub

echo ==================================================
echo              Mail Hub 本地启动器
echo ==================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 没有找到 Node.js。
  echo.
  echo 请先安装 Node.js 22 或更高版本，下载地址：
  echo   https://nodejs.org/zh-cn
  echo 下载 LTS 版本，一路点下一步即可，装完重启电脑再双击本文件。
  echo.
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set "NODEVER=%%v"
echo [检查] Node.js 版本 !NODEVER!

if not exist "node_modules\" (
  echo.
  echo [1/3] 首次运行，正在安装依赖，大约 1 到 3 分钟，请耐心等待...
  call npm install
  if errorlevel 1 (
    echo.
    echo [错误] 依赖安装失败。若卡在下载，可以在本窗口手动执行：
    echo   npm config set registry https://registry.npmmirror.com
    echo 然后删掉 node_modules 文件夹，重新双击本文件。
    pause
    exit /b 1
  )
) else (
  echo [检查] 依赖已安装
)

if not exist ".env" (
  echo.
  echo [提示] 没有找到 .env 配置文件，正在自动生成...
  copy ".env.example" ".env" >nul
  node -e "const f=require('fs');let s=f.readFileSync('.env','utf8');s=s.replace('change-me-to-a-random-string','mh_'+require('crypto').randomBytes(24).toString('hex'));f.writeFileSync('.env',s)"
  echo [完成] 已生成随机的管理员密钥
)

for /f "tokens=2 delims==" %%a in ('findstr /b "API_SECRET=" .env') do set "APISECRET=%%a"
for /f "tokens=2 delims==" %%a in ('findstr /b "PORT=" .env') do set "APPPORT=%%a"
if "!APPPORT!"=="" set "APPPORT=3100"

echo [检查] 端口 !APPPORT!

if not exist "dist\index.js" (
  echo.
  echo [2/3] 正在编译程序，大约 30 秒...
  call npm run build
  if errorlevel 1 (
    echo.
    echo [错误] 编译失败，请把上面的报错发给管理员。
    pause
    exit /b 1
  )
) else (
  echo [检查] 程序已编译
)

echo.
echo [3/3] 正在启动服务...
echo.
echo ==================================================
echo   浏览器地址:  http://localhost:!APPPORT!
echo   登录密钥:    !APISECRET!
echo ==================================================
echo.
echo   这一行是重点:
echo   - 保持这个黑色窗口开着，关掉它服务就停了
echo   - 按 Ctrl+C 可以停止服务
echo   - 密钥就是登录密码，请自己保存好，忘了见 .env 文件
echo.

if not "%MAILHUB_NO_BROWSER%"=="1" start "" "http://localhost:!APPPORT!"
node dist\index.js

echo.
echo 服务已停止。
pause
