@echo off
cd /d %~dp0
set PORT=5001
set API_PORT=5001
set VITE_PORT=5173
call npm run install:all
call npm run dev
pause
