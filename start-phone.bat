@echo off
rem Same as start.bat, but also reachable from your phone on the same Wi-Fi network.
rem The address to type on the phone is printed below. Keep this window open.
cd /d "%~dp0"
python server.py 8765 --lan
