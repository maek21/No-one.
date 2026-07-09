@echo off
echo.
echo ========================================
echo   NO-ONE — Clean Start
echo ========================================
echo.

echo Cleaning build artifacts...
rd /s /q frontend\node_modules 2>nul
rd /s /q frontend\dist 2>nul
rd /s /q backend\__pycache__ 2>nul
rd /s /q backend\cache 2>nul
rd /s /q node_modules 2>nul

echo.
echo Installing dependencies...
call npm install

echo.
echo ========================================
echo   Starting Development Servers
echo ========================================
echo.

call npm run dev
