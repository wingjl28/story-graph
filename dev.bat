@echo off
echo === Story Graph (Dev Mode) ===
echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo.

cd /d "%~dp0"

if not exist ".venv" (
    python -m venv .venv
)
call .venv\Scripts\activate.bat
pip install -q -r requirements.txt

:: Start backend in background
start "Story Graph - Backend" cmd /c "call .venv\Scripts\activate.bat && python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload"

:: Start frontend dev server
cd frontend
if not exist "node_modules" npm install
npm run dev
