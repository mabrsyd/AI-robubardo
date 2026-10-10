@echo off
title AI Studio Backend (Port 3001)
echo ========================================================
echo   Starting AI Visual Studio Backend API (Port 3001)
echo ========================================================
cd /d "d:\project\AI\ai-visual-studio\backend"
npx tsx src/server.ts
pause
