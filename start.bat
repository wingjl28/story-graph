@echo off
echo === Story Graph ===
echo.

cd /d "%~dp0"

:: Check Python
where python >nul 2>nul || (echo ERROR: Python not found. Install from python.org & pause & exit /b 1)

:: Install Python dependencies if needed
if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
)
call .venv\Scripts\activate.bat

echo Installing Python dependencies...
pip install -q -r requirements.txt

:: Check Node / npm
where npm >nul 2>nul || (echo ERROR: Node.js/npm not found. Install from nodejs.org & pause & exit /b 1)

:: Install & build frontend if needed
if not exist "frontend\dist" (
    echo.
    echo Building frontend (first run only, may take a minute)...
    cd frontend
    npm install --silent
    npm run build
    cd ..
)

echo.
echo Starting server...
echo Open http://localhost:8000 in your browser
echo (Also accessible on your network at http://%COMPUTERNAME%:8000)
echo.
echo Press Ctrl+C to stop.
echo.

python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
pause
