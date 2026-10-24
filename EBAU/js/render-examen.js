/* ==================================================================
   render-examen.js
   Renderiza examen.html a partir de Datos/<id>.json
   ================================================================== */
(function () {
    'use strict';

    var DATOS_PATH = 'Datos/';
    var DATOS_PATH_ALT = 'datos/';

    var params = new URLSearchParams(window.location.search);
    var examId = params.get('id') || window.EXAM_ID || null;

    if (!examId) {
        mostrarError(
            'Falta el parámetro <code>?id=</code> en la URL.<br>' +
            'Ejemplo: <code>examen.html?id=fisica-cyl-2026-extraordinaria</code>'
        );
        return;
    }

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

    function txt(s) { return s == null ? '' : String(s); }

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

    function render(data) {
        var codigo = '#' + txt(data.codigo) + '.- ';
        var titulo = txt(data.asignatura) + ' — ' + txt(data.comunidad) + ' ' +
                     txt(data.convocatoria) + ' ' + txt(data.anio);
        document.getElementById('header-codigo').textContent = codigo;
        document.getElementById('header-texto').textContent = titulo;
        document.title = '#' + txt(data.codigo) + ' · ' + titulo;

        // --- NUEVO: Insertar botones de PDF en la cabecera ---
        var baseCode = data.codigo ? data.codigo.replace('.SOL', '') : data.id;
        var pdfContainer = document.getElementById('pdf-links-container');
        
        if (!pdfContainer) {
            pdfContainer = document.createElement('div');
            pdfContainer.id = 'pdf-links-container';
            // Estilos en línea para que no tengas que tocar el CSS de examen.html
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
        // ----------------------------------------------------

        document.querySelector('#sec-enunciado .cuerpo').innerHTML =
            txt(data.enunciado_general || data.enunciado || '');
        document.querySelector('#sec-objetivo .cuerpo').innerHTML =
            txt(data.objetivo || '');

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

        var cont = document.getElementById('lista-ejercicios');
        cont.innerHTML = '';
        (data.ejercicios || []).forEach(function (ej) {
            cont.appendChild(buildEjercicio(ej));
        });

        if (data.pie_clave) {
            var pie = document.createElement('div');
            pie.className = 'pie-clave';
            pie.innerHTML =
                '<i class="fas fa-lightbulb"></i> ' +
                '<strong>Observaciones clave:</strong> ' + txt(data.pie_clave);
            cont.appendChild(pie);
        }

        if (data.titulo_desplegable) {
            var span = document.querySelector('#desplegable-ejercicios summary span:nth-child(2)');
            if (span) span.textContent = '🧪 ' + data.titulo_desplegable;
        }

        typesetMathJax();
    }

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