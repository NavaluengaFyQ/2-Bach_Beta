@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   Renombrador secuencial de imagenes
echo   (excluye archivos .txt)
echo ============================================
echo.

REM ============================================================
REM 1. Buscar el mayor numero existente en archivos ImagenXXX
REM    (ignorando los .txt)
REM ============================================================
set "maxnum=0"
for /f "delims=" %%f in ('dir /b /a-d "Imagen*" 2^>nul') do (
    set "file=%%f"
    set "ext=%%~xf"
    set "base=%%~nf"

    REM Ignorar .txt
    if /i not "!ext!"==".txt" (
        if /i "!base:~0,6!"=="Imagen" (
            set "num=!base:Imagen=!"
            echo !num!| findstr /r "^[0-9][0-9]*$" >nul
            if !errorlevel! equ 0 (
                REM Quitar ceros a la izquierda para comparar correctamente
                set "stripped=!num!"
                for /l %%i in (1,1,10) do (
                    if "!stripped:~0,1!"=="0" if not "!stripped!"=="0" (
                        set "stripped=!stripped:~1!"
                    )
                )
                if "!stripped!"=="" set "stripped=0"
                if !stripped! gtr !maxnum! set "maxnum=!stripped!"
            )
        )
    )
)

echo Numero maximo existente : Imagen!maxnum!
echo Los nuevos comenzaran en: Imagen (maxnum+1)
echo Los archivos .txt NO se renombran.
echo.

choice /c SN /m "Desea continuar con el renombrado"
if errorlevel 2 (
    echo Operacion cancelada por el usuario.
    pause
    exit /b
)
echo.

REM ============================================================
REM 2. Renombrar los demas archivos por orden de CREACION
REM    (dir /t:c = usa fecha de creacion para ordenar)
REM ============================================================
set /a "counter=maxnum"
set /a "renamed=0"
set /a "skipped_txt=0"

for /f "delims=" %%f in ('dir /b /a-d-h-s /t:c /o:d 2^>nul') do (
    set "file=%%f"
    set "ext=%%~xf"
    set "base=%%~nf"
    set "skip="

    REM Saltar el propio archivo .bat
    if /i "!file!"=="%~nx0" set "skip=1"

    REM Saltar archivos .txt
    if /i "!ext!"==".txt" (
        set "skip=1"
        set /a "skipped_txt+=1"
    )

    REM Saltar archivos que ya siguen el patron ImagenXXX
    if /i "!base:~0,6!"=="Imagen" (
        set "num=!base:Imagen=!"
        echo !num!| findstr /r "^[0-9][0-9]*$" >nul
        if !errorlevel! equ 0 set "skip=1"
    )

    if not defined skip (
        set /a "nextnum=counter+1"

        REM Rellenar con ceros a la izquierda (minimo 3 digitos)
        if !nextnum! lss 10  (set "newnum=00!nextnum!")
        if !nextnum! geq 10 if !nextnum! lss 100 (set "newnum=0!nextnum!")
        if !nextnum! geq 100 (set "newnum=!nextnum!")

        echo Renombrando: "!file!"  -^>  "Imagen!newnum!!ext!"

        ren "!file!" "Imagen!newnum!!ext!"
        if not errorlevel 1 (
            set "counter=!nextnum!"
            set /a "renamed+=1"
        ) else (
            echo   [ERROR] No se pudo renombrar "!file!"
        )
    )
)

echo.
echo ============================================
echo   Proceso completado.
echo   Archivos renombrados    : !renamed!
echo   Archivos .txt ignorados : !skipped_txt!
echo   Ultimo numero asignado  : Imagen!counter!
echo ============================================
pause