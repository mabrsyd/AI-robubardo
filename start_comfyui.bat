@echo off
title ComfyUI - RTX 2050 (Port 8188)
echo ========================================================
echo   Starting ComfyUI Portable (NVIDIA RTX 2050 LowVRAM)
echo ========================================================
cd /d "d:\project\AI\ComfyUI_windows_portable"
.\python_embeded\python.exe -s ComfyUI\main.py --listen 127.0.0.1 --port 8188 --lowvram
pause
