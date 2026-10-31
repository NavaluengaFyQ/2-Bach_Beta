@echo off
REM Desactiva la visualización de los comandos en la pantalla. 
REM Solo veremos el resultado de los "echo", no el código en sí.

chcp 65001 >nul
REM Cambia la página de códigos de la consola a UTF-8 (65001).
REM Esto es vital para que se vean bien las tildes (á, é, í) y las eñes (ñ).
REM El ">nul" oculta el mensaje que normalmente sale al cambiar esto (ej: "Página de códigos activa: 65001").

cd /d "%~dp0"
REM "%~dp0" se refiere a la ruta de la carpeta donde está este archivo .bat (la carpeta 'scripts').
REM "cd /d" cambia el directorio actual a esa carpeta. 
REM La "/d" permite cambiar de unidad de disco (ej: de C: a D:) si el proyecto estuviera en otro disco.

node unir-problemas.js
REM Ejecuta el archivo JavaScript usando Node.js.
REM Como estamos dentro de la carpeta 'scripts', no hace falta poner la ruta "scripts\..." 
REM Simplemente busca el archivo en el directorio actual.

echo.
REM Imprime una línea en blanco. El punto después de "echo" es el truco para que haga el salto de línea.

echo === Fin. Pulsa una tecla para cerrar ===
REM Muestra este texto en la consola para avisar de que el proceso ha terminado.

pause
REM Detiene la ejecución y muestra "Presione una tecla para continuar...".
REM Esto evita que la ventana negra se cierre instantáneamente y te da tiempo a leer si hubo algún error.