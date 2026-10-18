@echo off
chcp 65001 >nul
rem 一鍵啟動 Unsaid 的本機測試頁：雙擊這個檔即可。
rem 第一次會先安裝套件（要網路，約一分鐘）；之後直接開。關掉這個黑色視窗就會停止。
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [Unsaid] 找不到 Node.js。請先到 https://nodejs.org 安裝 22 版以上，再雙擊一次。
  pause
  exit /b 1
)

if not exist node_modules (
  echo [Unsaid] 第一次啟動，正在安裝套件...
  call npm install
  if errorlevel 1 (
    echo [Unsaid] 安裝失敗，請把上面的訊息截圖回報。
    pause
    exit /b 1
  )
)

echo [Unsaid] 啟動中，瀏覽器會自動打開。要停止就關掉這個視窗。
call npm start
pause
