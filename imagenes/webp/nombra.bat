@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   Renombrador secuencial de imagenes
echo   (prefijo ImagenF, 4 digitos, excluye .txt)
echo ============================================
echo.

REM ============================================================
REM 1. Buscar el mayor numero existente en archivos ImagenF####
REM    (ignorando los .txt)
REM ============================================================
set "maxnum=0"
for /f "delims=" %%f in ('dir /b /a-d "ImagenF*" 2^>nul') do (
    set "file=%%f"
    set "ext=%%~xf"
    set "base=%%~nf"

    REM Ignorar .txt
    if /i not "!ext!"==".txt" (
        if /i "!base:~0,7!"=="ImagenF" (
            set "num=!base:ImagenF=!"
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

REM Mostrar maxnum con 4 digitos (para la salida por pantalla)
set "maxdisp=!maxnum!"
if !maxnum! lss 10                       set "maxdisp=000!maxnum!"
if !maxnum! geq 10 if !maxnum! lss 100   set "maxdisp=00!maxnum!"
if !maxnum! geq 100 if !maxnum! lss 1000 set "maxdisp=0!maxnum!"

echo Numero maximo existente : ImagenF!maxdisp!
echo Los nuevos comenzaran en: ImagenF (maxnum+1)
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

    REM Saltar archivos que ya siguen el patron ImagenF####
    if /i "!base:~0,7!"=="ImagenF" (
        set "num=!base:ImagenF=!"
        echo !num!| findstr /r "^[0-9][0-9]*$" >nul
        if !errorlevel! equ 0 set "skip=1"
    )

    if not defined skip (
        set /a "nextnum=counter+1"

        REM Rellenar con ceros a la izquierda (minimo 4 digitos)
        if !nextnum! lss 10                       (set "newnum=000!nextnum!")
        if !nextnum! geq 10 if !nextnum! lss 100   (set "newnum=00!nextnum!")
        if !nextnum! geq 100 if !nextnum! lss 1000 (set "newnum=0!nextnum!")
        if !nextnum! geq 1000                      (set "newnum=!nextnum!")

        echo Renombrando: "!file!"  -^>  "ImagenF!newnum!!ext!"

        ren "!file!" "ImagenF!newnum!!ext!"
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

REM Ultimo numero con 4 digitos
set "lastdisp=!counter!"
if !counter! lss 10                       set "lastdisp=000!counter!"
if !counter! geq 10 if !counter! lss 100   set "lastdisp=00!counter!"
if !counter! geq 100 if !counter! lss 1000 set "lastdisp=0!counter!"

echo   Ultimo numero asignado  : ImagenF!lastdisp!
echo ============================================
pause