/* ==================================================================
   cargar-indice.js
   Rellena el <ul id="lista-examenes"> de index.html
   con las entradas de datos/indice.json
   ================================================================== */
(function () {
    'use strict';

    var ul = document.getElementById('lista-examenes');
    if (!ul) return;

    fetch('datos/indice.json')
        .then(function (r) {
            if (!r.ok) throw new Error('No se pudo cargar datos/indice.json (HTTP ' + r.status + ')');
            return r.json();
        })
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
        .catch(function (err) {
            ul.innerHTML = '<li style="color:#c53030;">' + err.message + '</li>';
        });
})();