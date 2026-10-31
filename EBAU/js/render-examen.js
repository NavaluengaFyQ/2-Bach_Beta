// ════════════════════════════════════════════════════════════════════════
// SECTOR 0 · IDENTIFICACIÓN DEL SCRIPT
// ════════════════════════════════════════════════════════════════════════
// Archivo   : js/render-examen.js
// Ubicación : raíz/js/
// Tipo      : Script de navegador (JS clásico, IIFE autocontenida)
// Entrada   : «?id=<slug>»  (o «window.EXAM_ID» como respaldo)
// Salida    : contenido de examen.html:
//               · cabecera (código + asignatura + comunidad + conv + año)
//               · botones de PDF en la cabecera (NUEVO)
//               · cuatro secciones: enunciado / objetivo / procedimiento / resultado
//               · desplegable «DESMITIFICANDO» con un card por ejercicio
//               · pie de observaciones clave (si hay)
// Depende   : fetch · MathJax 3 (opcional) · FontAwesome (iconos del pie)
// Inclusión : <script src="js/render-examen.js"></script>
//             al final de examen.html, o antes de </body>.
// ════════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════════
// SECTOR 1 · QUÉ HACE
// ════════════════════════════════════════════════════════════════════════
//   1. Lee el parámetro «?id=» de la URL (o «window.EXAM_ID»).
//      Si no hay id → caja de error explicando cómo construir la URL.
//   2. Carga `Datos/<id>.json` (fallback: `datos/<id>.json`).
//   3. `render(data)` rellena:
//        · header-codigo y header-texto (y document.title)
//        · contenedor #pdf-links-container con enlaces a los PDFs
//        · .cuerpo de #sec-enunciado y #sec-objetivo
//        · #sec-procedimiento como lista de `.step` numerados
//        · #sec-resultado como tabla resumen (tabla-resumen)
//        · #lista-ejercicios con un `.ejercicio-card` por ejercicio
//        · posible `.pie-clave` al final del desplegable
//        · título del desplegable si `data.titulo_desplegable`
//   4. `typesetMathJax()` espera activa a MathJax (máx. ~15 s) y
//      tipografía `document.body`; después ejecuta `hacerScrollAlProblema`.
//   5. `hacerScrollAlProblema()` resuelve «#pN» de la URL:
//      abre el `<details>` si hace falta y hace scroll + flash azul 2 s.
// ════════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════════
// SECTOR 2 · IIFE + 'use strict'
// ════════════════════════════════════════════════════════════════════════
// · IIFE: nada se expone en window salvo lo estrictamente necesario.
// · 'use strict': modo estricto para toda la función.
// · El script NO define listeners sobre DOMContentLoaded: asume que se
//   carga al final del <body> cuando el DOM ya está construido. Si en
//   algún momento se mueve al <head>, habrá que envolver la ejecución
//   en un DOMContentLoaded.
// ════════════════════════════════════════════════════════════════════════

(function () {
    'use strict';


    // ════════════════════════════════════════════════════════════════════
    // SECTOR 3 · RUTAS DE DATOS
    // ════════════════════════════════════════════════════════════════════
    // · `Datos/` (mayúscula) es la carpeta "oficial" — es donde escribe
    //   `scripts/unir-problemas.js` y donde vive `indice.json`.
    // · `datos/` (minúscula) se prueba como fallback por si en algún
    //   despliegue (GitHub Pages antiguo, IIS, etc.) se renombró.
    // · En Linux/macOS `Datos/` ≠ `datos/`, así que el fallback es
    //   necesario, no una redundancia.
    // ════════════════════════════════════════════════════════════════════

    var DATOS_PATH = 'Datos/';
    var DATOS_PATH_ALT = 'datos/';


    // ════════════════════════════════════════════════════════════════════
    // SECTOR 4 · LECTURA DE «?id=» Y GUARDA
    // ════════════════════════════════════════════════════════════════════
    // · Fuente principal : `?id=…` de la URL.
    // · Respaldo         : `window.EXAM_ID` (útil para previews o tests).
    // · Si no hay id     : `mostrarError` y `return` (no se ejecuta nada
    //   más de la IIFE).
    // ════════════════════════════════════════════════════════════════════

    var params = new URLSearchParams(window.location.search);
    var examId = params.get('id') || window.EXAM_ID || null;

    if (!examId) {
        mostrarError(
            'Falta el parámetro <code>?id=</code> en la URL.<br>' +
            'Ejemplo: <code>examen.html?id=fisica-cyl-2026-extraordinaria</code>'
        );
        return;
    }


    // ════════════════════════════════════════════════════════════════════
    // SECTOR 5 · CARGA DEL JSON (con fallback de ruta)
    // ════════════════════════════════════════════════════════════════════
    // · `intentarCargar` hace fetch y devuelve la promesa de `.json()`.
    //   Si `!r.ok` lanza para que el `.catch` decida (fallback).
    // · Cadena: intenta `Datos/<id>.json`; si falla, `datos/<id>.json`;
    //   si ambos fallan → `mostrarError`.
    // · No hay reintento con caché ni cancelación: es una sola lectura.
    // ════════════════════════════════════════════════════════════════════

    function intentarCargar(ruta) {
        return fetch(ruta).then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    intentarCargar(DATOS_PATH + examId + '.json')
        .catch(function() {
            return intentarCargar(DATOS_PATH_ALT + examId + '.json');
        })
        .then(render)
        .catch(function (err) {
            mostrarError(
                'No se encontró el examen <code>' + examId + '</code>.<br>' +
                'Revisa que el archivo <code>' + examId + '.json</code> esté dentro de la carpeta <code>Datos</code>.'
            );
        });


    // ════════════════════════════════════════════════════════════════════
    // SECTOR 6 · HELPERS DE TEXTO
    // ════════════════════════════════════════════════════════════════════
    // · `txt(s)` → '' si null/undefined, si no String(s).
    //   NO escapa HTML: los campos del JSON se inyectan como HTML (el
    //   JSON es de confianza, generado por el propio centro). Si en el
    //   futuro se admite contenido externo, habría que escapar aquí.
    // ════════════════════════════════════════════════════════════════════

    function txt(s) { return s == null ? '' : String(s); }


    // ════════════════════════════════════════════════════════════════════
    // SECTOR 7 · GESTIÓN DE ERRORES DE CARGA
    // ════════════════════════════════════════════════════════════════════
    // Ante un fallo (sin id, JSON inexistente, JSON corrupto):
    //   1. Vacía TODOS los `.cuerpo` (secciones enunciado/objetivo/…).
    //   2. Vacía #lista-ejercicios (desplegable).
    //   3. Pone "Error" en #header-texto.
    //   4. Inserta una caja `.error-carga` justo después del header
    //      (índice 1 del .container), con el mensaje recibido.
    // El mensaje admite HTML (por eso usa `<code>…</code>`).
    // ════════════════════════════════════════════════════════════════════

    function mostrarError(msgHtml) {
        document.querySelectorAll('.cuerpo').forEach(function (el) { el.innerHTML = ''; });
        var lista = document.getElementById('lista-ejercicios');
        if (lista) lista.innerHTML = '';
        var header = document.getElementById('header-texto');
        if (header) header.textContent = 'Error';

        var caja = document.createElement('div');
        caja.className = 'error-carga';
        caja.innerHTML = '<strong>⚠️ Error al cargar el examen</strong><br><br>' + msgHtml;
        var container = document.querySelector('.container');
        container.insertBefore(caja, container.children[1] || null);
    }


    // ════════════════════════════════════════════════════════════════════
    // SECTOR 8 · RENDER PRINCIPAL
    // ════════════════════════════════════════════════════════════════════
    // Recibe el objeto `data` ya parseado y rellena toda la página:
    //
    //   8.1  Cabecera: #header-codigo, #header-texto, document.title.
    //
    //   8.2  Botones de PDF (#pdf-links-container) — NUEVO.
    //        · `baseCode` = data.codigo sin el sufijo ".SOL" (si lo hay);
    //          si no hay `codigo`, se usa `data.id`.
    //        · Si el contenedor no existe, se crea y se inserta JUSTO
    //          después de #header-texto (una sola vez).
    //        · Se rellenan dos enlaces: <baseCode>.pdf y <baseCode>.CRI.pdf
    //        · Estilos inline (background, padding, border, radius, color)
    //          para no tocar el CSS global de examen.html.
    //
    //   8.3  Enunciado y objetivo: se vierten en sus `.cuerpo`.
    //
    //   8.4  Procedimiento: se vacía el contenedor y se genera un `.step`
    //        por elemento de `data.procedimiento`, con `.step-num` y el
    //        título en negrita seguido de contenido.
    //
    //   8.5  Resultado: si hay `data.ejercicios`, se construye una tabla
    //        `.tabla-resumen` con columnas #, Tema y Resultado principal;
    //        se antepone `resultado_intro` y se pospone `resultado_cierre`
    //        si existen.
    //
    //   8.6  Desplegable de ejercicios: se vacía #lista-ejercicios y se
    //        añade un `buildEjercicio(ej)` por cada uno.
    //
    //   8.7  Pie de observaciones: si `data.pie_clave`, se añade al final
    //        del desplegable con un icono FontAwesome (fa-lightbulb).
    //
    //   8.8  Título del desplegable: si `data.titulo_desplegable`, se
    //        sustituye el texto del segundo `<span>` del summary por
    //        "🧪 <titulo>".
    //
    //   8.9  `typesetMathJax()` para tipografiar todas las fórmulas.
    // ════════════════════════════════════════════════════════════════════

    function render(data) {

        // 8.1 · Cabecera ────────────────────────────────────────────────
        var codigo = '#' + txt(data.codigo) + '.- ';
        var titulo = txt(data.asignatura) + ' — ' + txt(data.comunidad) + ' ' +
                     txt(data.convocatoria) + ' ' + txt(data.anio);
        document.getElementById('header-codigo').textContent = codigo;
        document.getElementById('header-texto').textContent = titulo;
        document.title = '#' + txt(data.codigo) + ' · ' + titulo;

        // 8.2 · Botones de PDF en la cabecera (NUEVO) ─────────────────
        var baseCode = data.codigo ? data.codigo.replace('.SOL', '') : data.id;
        var pdfContainer = document.getElementById('pdf-links-container');

        if (!pdfContainer) {
            pdfContainer = document.createElement('div');
            pdfContainer.id = 'pdf-links-container';
            // Estilos en línea para no tocar el CSS de examen.html
            pdfContainer.style.cssText = 'margin: 15px 0; padding: 12px 15px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; display: flex; gap: 15px; flex-wrap: wrap; align-items: center;';

            var header = document.getElementById('header-texto');
            if (header && header.parentNode) {
                header.parentNode.insertBefore(pdfContainer, header.nextSibling);
            }
        }

        pdfContainer.innerHTML = `
            <strong style="color:#0369a1; font-size:14px;">📄 Documentos del examen:</strong>
            <a href="./PDF/${baseCode}.pdf" target="_blank" style="background:white; padding:6px 12px; border-radius:6px; border:1px solid #7dd3fc; color:#0284c7; text-decoration:none; font-weight:bold; font-size:13px;">Ver Examen (PDF)</a>
            <a href="./PDF/${baseCode}.CRI.pdf" target="_blank" style="background:white; padding:6px 12px; border-radius:6px; border:1px solid #7dd3fc; color:#0284c7; text-decoration:none; font-weight:bold; font-size:13px;">Ver Criterios (PDF)</a>
        `;

        // 8.3 · Enunciado y objetivo ──────────────────────────────────
        document.querySelector('#sec-enunciado .cuerpo').innerHTML =
            txt(data.enunciado_general || data.enunciado || '');
        document.querySelector('#sec-objetivo .cuerpo').innerHTML =
            txt(data.objetivo || '');

        // 8.4 · Procedimiento ─────────────────────────────────────────
        var proc = document.querySelector('#sec-procedimiento .cuerpo');
        proc.innerHTML = '';
        (data.procedimiento || []).forEach(function (p, i) {
            var div = document.createElement('div');
            div.className = 'step';
            div.innerHTML =
                '<span class="step-num">' + (i + 1) + '</span>' +
                '<strong>' + txt(p.titulo) + '.</strong> ' + txt(p.contenido);
            proc.appendChild(div);
        });

        // 8.5 · Resultado (tabla resumen) ─────────────────────────────
        var res = document.querySelector('#sec-resultado .cuerpo');
        res.innerHTML = '';
        if (data.ejercicios && data.ejercicios.length) {
            if (data.resultado_intro) {
                var intro = document.createElement('p');
                intro.innerHTML = txt(data.resultado_intro);
                res.appendChild(intro);
            }
            var tabla = document.createElement('table');
            tabla.className = 'tabla-resumen';
            tabla.innerHTML =
                '<thead><tr><th>#</th><th>Tema</th><th>Resultado principal</th></tr></thead>';
            var tbody = document.createElement('tbody');
            data.ejercicios.forEach(function (ej) {
                var tr = document.createElement('tr');
                tr.innerHTML =
                    '<td><strong>' + txt(ej.numero) + '</strong></td>' +
                    '<td>' + txt(ej.tema) + '</td>' +
                    '<td>' + txt(ej.resultado) + '</td>';
                tbody.appendChild(tr);
            });
            tabla.appendChild(tbody);
            res.appendChild(tabla);
            if (data.resultado_cierre) {
                var cierre = document.createElement('p');
                cierre.innerHTML = txt(data.resultado_cierre);
                res.appendChild(cierre);
            }
        }

        // 8.6 · Desplegable de ejercicios ─────────────────────────────
        var cont = document.getElementById('lista-ejercicios');
        cont.innerHTML = '';
        (data.ejercicios || []).forEach(function (ej) {
            cont.appendChild(buildEjercicio(ej));
        });

        // 8.7 · Pie de observaciones clave ────────────────────────────
        if (data.pie_clave) {
            var pie = document.createElement('div');
            pie.className = 'pie-clave';
            pie.innerHTML =
                '<i class="fas fa-lightbulb"></i> ' +
                '<strong>Observaciones clave:</strong> ' + txt(data.pie_clave);
            cont.appendChild(pie);
        }

        // 8.8 · Título del desplegable ────────────────────────────────
        if (data.titulo_desplegable) {
            var span = document.querySelector('#desplegable-ejercicios summary span:nth-child(2)');
            if (span) span.textContent = '🧪 ' + data.titulo_desplegable;
        }

        // 8.9 · Tipografiar fórmulas ──────────────────────────────────
        typesetMathJax();
    }


    // ════════════════════════════════════════════════════════════════════
    // SECTOR 9 · CONSTRUCCIÓN DE UN EJERCICIO
    // ════════════════════════════════════════════════════════════════════
    // Genera el nodo `<div class="ejercicio-card" id="p<numero>">` con:
    //   · `.ejercicio-header`:
    //       – `.num`        → número del ejercicio
    //       – título
    //       – `.materia`    → tema (si existe)
    //       – `.puntos`     → puntuación (si existe)
    //   · `.ejercicio-body`:
    //       – «📌 Enunciado:» + enunciado
    //       – un <p> por apartado: letra + enunciado + puntuación opcional
    //       – `.resolucion` con un `.paso` por elemento de `ej.resolucion`
    //       – `.resultado-final` con el resultado
    //
    // `id = 'p' + ej.numero` es CONTRATO con:
    //   · los deep-links «#pN» (hacerScrollAlProblema, SECTOR 11)
    //   · el buscador, que enlaza `examen.html?id=…#pN` (SECTOR 20 de
    //     filtro-problemas-inline.js)
    // Cambiar este patrón rompe ambos extremos.
    // ════════════════════════════════════════════════════════════════════

    function buildEjercicio(ej) {
        var card = document.createElement('div');
        card.className = 'ejercicio-card';
        card.id = 'p' + ej.numero;

        var head = document.createElement('div');
        head.className = 'ejercicio-header';
        var htmlHead =
            '<span class="num">' + txt(ej.numero) + '</span>' +
            '<span>' + txt(ej.titulo) + '</span>';
        if (ej.tema)       htmlHead += '<span class="materia">' + txt(ej.tema) + '</span>';
        if (ej.puntuacion) htmlHead += '<span class="puntos">' + txt(ej.puntuacion) + '</span>';
        head.innerHTML = htmlHead;
        card.appendChild(head);

        var body = document.createElement('div');
        body.className = 'ejercicio-body';

        var html = '<div class="enunciado-ej">📌 Enunciado:</div>' +
                   '<p>' + txt(ej.enunciado) + '</p>';

        (ej.apartados || []).forEach(function (ap) {
            html += '<p>' +
                    '<strong>' + txt(ap.letra) + ')</strong> ' +
                    txt(ap.enunciado) +
                    (ap.puntuacion ? ' <em>(' + txt(ap.puntuacion) + ')</em>' : '') +
                    '</p>';
        });

        html += '<div class="resolucion">';
        (ej.resolucion || []).forEach(function (paso) {
            html += '<div class="paso">' +
                    '<strong>' + txt(paso.titulo) + '.</strong> ' +
                    txt(paso.contenido) +
                    '</div>';
        });
        html += '<div class="resultado-final">✔️ <strong>Resultado:</strong> ' +
                txt(ej.resultado) + '</div>';
        html += '</div>';

        body.innerHTML = html;
        card.appendChild(body);
        return card;
    }


    // ════════════════════════════════════════════════════════════════════
    // SECTOR 10 · TIPOGRAFIADO CON MATHJAX (espera activa)
    // ════════════════════════════════════════════════════════════════════
    // MathJax puede no haber cargado todavía (script async). Se sondea
    // cada 100 ms hasta ~15 s (150 intentos). Al encontrarlo:
    //   · limpia el interval
    //   · llama a `MathJax.typesetPromise([document.body])`
    //   · en `.finally`, ejecuta `hacerScrollAlProblema` → el scroll
    //     se hace SIEMPRE después de tipografiar (alturas correctas).
    // Si tras 150 intentos no ha cargado, también hace scroll (sin
    // tipografiar) para no dejar la página "sin hacer nada".
    // ════════════════════════════════════════════════════════════════════

    function typesetMathJax() {
        var tries = 0;
        var interval = setInterval(function () {
            tries++;
            if (window.MathJax && window.MathJax.typesetPromise) {
                clearInterval(interval);
                window.MathJax.typesetPromise([document.body])
                    .catch(function (e) { console.warn('MathJax:', e); })
                    .finally(hacerScrollAlProblema);
            } else if (tries > 150) {
                clearInterval(interval);
                hacerScrollAlProblema();
            }
        }, 100);
    }


    // ════════════════════════════════════════════════════════════════════
    // SECTOR 11 · SCROLL AL PROBLEMA DEL HASH
    // ════════════════════════════════════════════════════════════════════
    // Si la URL trae «#pN»:
    //   1. Resuelve el elemento `document.getElementById('pN')`.
    //   2. Si está dentro de un `<details>` cerrado → lo abre.
    //   3. `scrollIntoView` suave (100 ms después para dar tiempo al
    //      layout tras abrir el desplegable).
    //   4. Flash azul (#e0f2fe) con transición de 0,5 s; se limpia a los
    //      2 s.
    // Si el hash no corresponde a ningún `#pN`, no hace nada.
    // ════════════════════════════════════════════════════════════════════

    function hacerScrollAlProblema() {
        if (window.location.hash) {
            var idProblema = window.location.hash.substring(1);
            var elemento = document.getElementById(idProblema);

            if (elemento) {
                var desplegable = elemento.closest('details');
                if (desplegable && !desplegable.open) {
                    desplegable.open = true;
                }

                setTimeout(function() {
                    elemento.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    elemento.style.transition = 'background-color 0.5s';
                    elemento.style.backgroundColor = '#e0f2fe';
                    setTimeout(function() { elemento.style.backgroundColor = ''; }, 2000);
                }, 100);
            }
        }
    }

})();