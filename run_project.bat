@echo off
echo Updating PATH from registry...
for /f "tokens=2*" %%A in ('reg query "HKLM\System\CurrentControlSet\Control\Session Manager\Environment" /v Path') do set MachinePath=%%B
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path') do set UserPath=%%B
set PATH=%MachinePath%;%UserPath%

echo 📦 Installing dependencies...
call npm install
cd frontend && call npm install --force && cd ..
cd backend && call npm install && cd ..
cd admin-panel && call npm install && cd ..

echo 🚀 Starting the application...
call start_all.bat
exit
