@echo off
echo === Story Graph (Local Dev Mode) ===
echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo.

cd /d "%~dp0"

:: --- Dev-mode auth bypass: clear any cloud auth env vars ---
set COGNITO_USER_POOL_ID=
set VITE_COGNITO_AUTHORITY=
set VITE_COGNITO_CLIENT_ID=

:: --- Start local Postgres (no-op if already running) ---
echo Starting local Postgres...
docker compose -f docker-compose.dev.yml up -d --wait
if %errorlevel% neq 0 (
    echo ERROR: Could not start Postgres container. Is Docker Desktop running?
    pause
    exit /b 1
)
echo Postgres ready.
echo.

:: --- Python venv + deps ---
if not exist ".venv" (
    python -m venv .venv
)
call .venv\Scripts\activate.bat
pip install -q -r requirements.txt

:: --- Start backend in background (inherits cleared env vars) ---
start "Story Graph - Backend" cmd /c "call .venv\Scripts\activate.bat && python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload"

:: --- Start frontend dev server ---
cd frontend
if not exist "node_modules" npm install
npm run dev
