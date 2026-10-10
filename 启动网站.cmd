@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo 请先安装 Node.js 24，然后重新打开此文件。
 pause
 exit /b 1
)
if not exist node_modules (
 call npm ci
 if errorlevel 1 goto failed
)
call npm run db:init
if errorlevel 1 goto failed
echo 网站启动后请打开 http://127.0.0.1:5173
call npm run dev
exit /b
:failed
echo 启动失败，请查看上方错误信息。
pause
