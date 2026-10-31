// ════════════════════════════════════════════════════════════════════════
// SECTOR 0 · IDENTIFICACIÓN DEL SCRIPT
// ════════════════════════════════════════════════════════════════════════
// Archivo   : cargar-indice.js
// Ubicación : raíz/  (junto a index.html, o referenciado desde él)
// Tipo      : Script de navegador (JS clásico, IIFE autocontenida)
// Entrada   : datos/indice.json
// Salida    : <ul id="lista-examenes"> de index.html
//
// Inclusión típica en index.html:
//   <ul id="lista-examenes"></ul>
//   <script src="cargar-indice.js"></script>
// ════════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════════
// SECTOR 1 · QUÉ HACE
// ════════════════════════════════════════════════════════════════════════
//   1. Localiza el contenedor <ul id="lista-examenes"> en el DOM.
//   2. Hace fetch de `datos/indice.json` (array de exámenes).
//   3. Vacía el <ul> y genera un <li> por examen con:
//        · enlace a   examen.html?id=<id>
//        · texto      "#codigo · asignatura — comunidad convocatoria año"
//        · contador   "(N ejercicios)" en gris
//   4. Si el fetch o el parseo fallan, escribe el mensaje de error
//      dentro del propio <ul>, en rojo, sin romper la página.
// ════════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════════
// SECTOR 2 · POR QUÉ EXISTE
// ════════════════════════════════════════════════════════════════════════
// · Mantener index.html "limpio": en lugar de editar a mano una lista de
//   decenas de exámenes, se genera dinámicamente desde el índice.
// · Añadir un examen nuevo = añadirlo a `datos/indice.json` y ejecutar
//   `scripts/unir-problemas.js`. No se toca este HTML ni este JS.
// · El <ul> es el "punto de montaje" estable; el resto es dinámico.
// ════════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════════
// SECTOR 3 · DEPENDENCIAS
// ════════════════════════════════════════════════════════════════════════
//   · Solo APIs nativas del navegador: `fetch`, `document`, `encodeURIComponent`.
//   · No requiere librerías externas (ni jQuery, ni frameworks).
//   · Requiere navegador moderno con `fetch` (todos los evergreen).
//   · Ruta relativa `datos/indice.json` → el script DEBE ejecutarse desde
//     index.html (o desde una página hermana que resuelva esa ruta).
// ════════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════════
// SECTOR 4 · CONTRATO CON `indice.json`
// ════════════════════════════════════════════════════════════════════════
// Cada elemento del array debe tener, como mínimo:
//   · id             → slug del examen (= nombre del JSON en Datos/)
//   · codigo         → "#—"  mostrado en negrita
//   · asignatura     → p.ej. "Física"
//   · comunidad      → p.ej. "Castilla y León"
//   · convocatoria   → p.ej. "Ordinaria"
//   · anio           → p.ej. 2026
//   · num_ejercicios → contador mostrado entre paréntesis
//
// Los campos ausentes se renderizan como `undefined` (no rompe, pero
// conviene mantener el esquema). El `id` SÍ es imprescindible: sin él,
// el enlace `examen.html?id=` no lleva a ningún sitio.
// ════════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════════
// SECTOR 5 · IIFE + GUARDA DE DOM
// ════════════════════════════════════════════════════════════════════════
// · IIFE: evita contaminar `window` con variables locales.
// · 'use strict': modo estricto para toda la función.
// · Guarda: si no existe `#lista-examenes` en la página (p.ej. el script
//   se ha incluido por error en otra página), salir sin error.
// ════════════════════════════════════════════════════════════════════════

(function () {
    'use strict';

    var ul = document.getElementById('lista-examenes');
    if (!ul) return;


    // ════════════════════════════════════════════════════════════════════
    // SECTOR 6 · FETCH DEL ÍNDICE
    // ════════════════════════════════════════════════════════════════════
    // · `r.ok` cubre 4xx/5xx: se lanza Error con el código HTTP.
    // · `.json()` vuelve a fallar si el cuerpo no es JSON válido → cae
    //   igualmente en el `.catch`.
    // ════════════════════════════════════════════════════════════════════

    fetch('datos/indice.json')
        .then(function (r) {
            if (!r.ok) throw new Error('No se pudo cargar datos/indice.json (HTTP ' + r.status + ')');
            return r.json();
        })


        // ════════════════════════════════════════════════════════════════
        // SECTOR 7 · RENDERIZADO DE LA LISTA
        // ════════════════════════════════════════════════════════════════
        // · `ul.innerHTML = ''` limpia el "Cargando…" previo (si lo hubiera).
        // · Por cada examen se crea un <li> con:
        //     – <a href="examen.html?id=<id>">   (encodeURIComponent por seguridad)
        //     – "#codigo · asignatura — comunidad convocatoria anio"
        //     – "(N ejercicios)" en gris, fuera del enlace
        // · Estilos inline mínimos para no depender de CSS externo.
        // ════════════════════════════════════════════════════════════════

        .then(function (lista) {
            ul.innerHTML = '';
            lista.forEach(function (e) {
                var li = document.createElement('li');
                li.style.marginBottom = '8px';
                li.innerHTML =
                    '<a href="examen.html?id=' + encodeURIComponent(e.id) + '">' +
                        '<strong>#' + e.codigo + '</strong> · ' +
                        e.asignatura + ' — ' + e.comunidad + ' ' +
                        e.convocatoria + ' ' + e.anio +
                    '</a> ' +
                    '<span style="color:#718096;font-size:0.9em;">(' +
                        e.num_ejercicios + ' ejercicios)</span>';
                ul.appendChild(li);
            });
        })


        // ════════════════════════════════════════════════════════════════
        // SECTOR 8 · GESTIÓN DE ERRORES
        // ════════════════════════════════════════════════════════════════
        // · Cubre: fallo de red, HTTP ≠ 200, JSON inválido, JSON no-array
        //   (en ese caso `lista.forEach` lanzaría TypeError).
        // · El mensaje se muestra DENTRO del propio <ul>, en rojo.
        // · Nunca se lanza fuera de la IIFE → no rompe otros scripts.
        // ════════════════════════════════════════════════════════════════

        .catch(function (err) {
            ul.innerHTML = '<li style="color:#c53030;">' + err.message + '</li>';
        });

})();


// ════════════════════════════════════════════════════════════════════════
// SECTOR 9 · NOTAS DE MANTENIMIENTO
// ════════════════════════════════════════════════════════════════════════
// · Si en algún momento se renombra `datos/` → `Datos/`, hay que tocar
//   la ruta del `fetch` (SECTOR 6). Ojo: `unir-problemas.js` escribe en
//   `Datos/` con mayúscula; en Linux/macOS `datos/` ≠ `Datos/`.
// · Para escapar HTML de campos libres (asignatura, comunidad…), usar
//   `textContent` en lugar de `innerHTML` si en el futuro se admite
//   contenido externo. Hoy los datos son propios y se confía en ellos.
// · Si crece la lista (más de ~100 exámenes), valorar paginación o
//   filtros en cliente; el patrón actual pinta todo de golpe.
// ════════════════════════════════════════════════════════════════════════