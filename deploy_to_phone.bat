@echo off
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "Path=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%Path%"

cd terminal-app
echo 📦 Building Web Assets...
call npm run build
echo 🔄 Syncing with Android...
call npx cap sync android
echo 🚀 Running on Device...
call npx cap run android --target=b3bccb7b
cd ..
