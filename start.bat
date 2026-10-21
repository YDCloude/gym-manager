@echo off
rem Starts Gym Manager on http://localhost:8765 (keep this window open while you use the app).
rem Always use the same address so your saved workouts are found.
cd /d "%~dp0"
start "" http://localhost:8765/
python server.py 8765
