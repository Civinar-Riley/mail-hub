@echo off
setlocal
cd /d "%~dp0"
title Mail Hub (dev)

echo ==================================================
echo    Mail Hub 开发模式：改代码会自动重启
echo ==================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 没有找到 Node.js，请先安装 22 或更高版本：https://nodejs.org/zh-cn
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [1/2] 正在安装依赖...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
  node -e "const f=require('fs');let s=f.readFileSync('.env','utf8');s=s.replace('change-me-to-a-random-string','mh_'+require('crypto').randomBytes(24).toString('hex'));f.writeFileSync('.env',s)"
  echo [提示] 已生成 .env，密钥在文件里的 API_SECRET 一行
)

for /f "tokens=2 delims==" %%a in ('findstr /b "API_SECRET=" .env') do set "APISECRET=%%a"
for /f "tokens=2 delims==" %%a in ('findstr /b "PORT=" .env') do set "APPPORT=%%a"
if "%APPPORT%"=="" set "APPPORT=3100"

echo.
echo   地址: http://localhost:%APPPORT%
echo   密钥: %APISECRET%
echo   改 src 下的后端文件会自动重启；改前端文件刷新浏览器即可
echo.

if not "%MAILHUB_NO_BROWSER%"=="1" start "" "http://localhost:%APPPORT%"
call npm run dev
pause
