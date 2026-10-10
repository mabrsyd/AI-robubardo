@echo off
echo ========================================================
echo   Launching AI Visual Studio (ComfyUI + Backend + UI)
echo ========================================================
start "ComfyUI" cmd /k "d:\project\AI\start_comfyui.bat"
timeout /t 6 /nobreak >nul
start "Backend" cmd /k "d:\project\AI\start_backend.bat"
timeout /t 3 /nobreak >nul
start "Frontend" cmd /k "d:\project\AI\start_frontend.bat"
echo.
echo All 3 services have been launched in separate windows!
echo Open http://localhost:3000 in your browser.
pause
