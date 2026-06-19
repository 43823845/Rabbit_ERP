@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   Rabbit_ERP 安装包构建脚本
echo ========================================
echo.

:: ponytail: cleanup handled by prebuild:exe → cleanup-release.cjs

:: 清除所有代理设置 (如果本机有代理且未运行，必须清理)
set HTTP_PROXY=
set HTTPS_PROXY=
set http_proxy=
set https_proxy=
set no_proxy=*
set NO_PROXY=*
set ELECTRON_GET_USE_PROXY=false
set GLOBAL_AGENT_NO_PROXY=*

:: 使用中国镜像加速 Electron 下载
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_CUSTOM_DIR=v35.7.5

echo [1/2] TypeScript 类型检查 + Vite 前端构建...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo 前端构建失败！
    pause
    exit /b 1
)

echo.
echo [2/2] electron-builder 打包（生成 NSIS 安装包）...
echo.

npx electron-builder --win --x64 --publish=never

if %ERRORLEVEL% neq 0 (
    echo.
    echo 安装包构建失败，请检查错误信息。
    pause
    exit /b 1
)

echo.
echo ========================================
echo   构建完成！
echo.
echo   安装包: release\Rabbit_ERP Setup 0.1.0.exe
echo   免安装: release\win-unpacked\Rabbit_ERP.exe
echo ========================================
echo.
pause
