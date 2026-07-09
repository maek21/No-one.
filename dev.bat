@echo off
echo Starting NO-ONE Development Environment
echo.

echo Installing dependencies...
echo.

:: Install Python dependencies
echo [1/2] Installing Python dependencies...
cd backend
pip install -r requirements.txt
cd ..

:: Install Node dependencies
echo [2/2] Installing Node dependencies...
call npm install

echo.
echo All dependencies installed!
echo.
echo Starting servers...
echo - Backend: http://localhost:8000
echo - Frontend: http://localhost:5174
echo.

:: Start both servers
call npm run dev
