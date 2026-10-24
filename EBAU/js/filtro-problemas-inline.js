// js/filtro-problemas-inline.js
let todosLosProblemas = [];
let aniosSeleccionados = [];
let convocatoriasSeleccionadas = [];
let temasSeleccionados = [];

function txt(s) { return s == null ? '' : String(s); }

// Función auxiliar para quitar tildes y pasar a minúsculas
function normalizarTexto(texto) {
    if (!texto) return '';
    return texto.toString().toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""); // Elimina los acentos
}

async function cargarDatos() {
    const contenedor = document.getElementById('resultados');
    contenedor.innerHTML = '<p style="text-align:center; color:#64748b; padding: 20px;">Cargando problemas...</p>';

    try {
        const resIndice = await fetch('./Datos/indice.json');
        const indice = await resIndice.json();

        const promesasExamenes = indice.map(ex => {
            const idLimpio = ex.id; 
            return fetch(`./Datos/${idLimpio}.json`)
                .then(res => {
                    if (!res.ok) throw new Error(`No se encontró ${idLimpio}.json`);
                    return res.json();
                })
                .then(data => {
                    data.id = idLimpio; 
                    data.codigo = ex.codigo;
                    return data;
                });
        });
        
        const examenesCompletos = await Promise.all(promesasExamenes);

        todosLosProblemas = examenesCompletos.flatMap(examen => {
            if (!examen.ejercicios) return [];
            
            return examen.ejercicios.map(ej => ({
                ...ej, 
                examenId: examen.id,
                anio: examen.anio,
                convocatoria: examen.convocatoria,
                codigo: examen.codigo
            }));
        });

        inicializarFiltros();
        renderizarResultados();

    } catch (error) {
        console.error("Error cargando los datos:", error);
        contenedor.innerHTML = `<p style="text-align:center; color:red;">Error al cargar: ${error.message}</p>`;
    }
}

function inicializarFiltros() {
    // Años
    const anios = [...new Set(todosLosProblemas.map(p => p.anio))].sort((a, b) => b - a);
    const contenedorAnios = document.getElementById('filtros-anio');
    contenedorAnios.innerHTML = ''; 

    anios.forEach(anio => {
        const btn = document.createElement('button');
        btn.className = 'btn-filtro';
        btn.textContent = anio;
        btn.onclick = () => toggleFiltro(anio, 'anio', btn);
        contenedorAnios.appendChild(btn);
    });

    // Convocatorias
    const convocatorias = [...new Set(todosLosProblemas.map(p => p.convocatoria))].sort();
    const contenedorConvocatorias = document.getElementById('filtros-convocatoria');
    contenedorConvocatorias.innerHTML = '';

    convocatorias.forEach(conv => {
        const btn = document.createElement('button');
        btn.className = 'btn-filtro';
        btn.textContent = conv;
        btn.onclick = () => toggleFiltro(conv, 'convocatoria', btn);
        contenedorConvocatorias.appendChild(btn);
    });

    // Temas
    const temas = [...new Set(todosLosProblemas.map(p => p.tema))].sort();
    const contenedorTemas = document.getElementById('filtros-tema');
    contenedorTemas.innerHTML = '';

    temas.forEach(tema => {
        const btn = document.createElement('button');
        btn.className = 'btn-filtro';
        btn.textContent = tema;
        btn.onclick = () => toggleFiltro(tema, 'tema', btn);
        contenedorTemas.appendChild(btn);
    });

    // Eventos
    document.getElementById('select-orden').addEventListener('change', renderizarResultados);
    document.getElementById('check-mostrar-enunciado').addEventListener('change', renderizarResultados);
    document.getElementById('btn-limpiar').addEventListener('click', limpiarFiltros);
    
    // NUEVOS EVENTOS DEL BUSCADOR
    document.getElementById('input-busqueda').addEventListener('input', renderizarResultados);
    document.getElementById('select-logica').addEventListener('change', renderizarResultados);
}

function toggleFiltro(valor, tipo, boton) {
    if (tipo === 'anio') {
        if (aniosSeleccionados.includes(valor)) {
            aniosSeleccionados = aniosSeleccionados.filter(a => a !== valor);
            boton.classList.remove('activo');
        } else {
            aniosSeleccionados.push(valor);
            boton.classList.add('activo');
        }
    } else if (tipo === 'convocatoria') {
        if (convocatoriasSeleccionadas.includes(valor)) {
            convocatoriasSeleccionadas = convocatoriasSeleccionadas.filter(c => c !== valor);
            boton.classList.remove('activo');
        } else {
            convocatoriasSeleccionadas.push(valor);
            boton.classList.add('activo');
        }
    } else {
        if (temasSeleccionados.includes(valor)) {
            temasSeleccionados = temasSeleccionados.filter(t => t !== valor);
            boton.classList.remove('activo');
        } else {
            temasSeleccionados.push(valor);
            boton.classList.add('activo');
        }
    }
    renderizarResultados();
    actualizarBotonLimpiar();
}

function renderizarResultados() {
    const orden = document.getElementById('select-orden').value;
    const mostrarEnunciado = document.getElementById('check-mostrar-enunciado').checked;
    const contenedor = document.getElementById('resultados');
    
    // Recogemos los valores del buscador
    const query = normalizarTexto(document.getElementById('input-busqueda').value);
    const logica = document.getElementById('select-logica').value;
    const palabrasBuscadas = query.split(/\s+/).filter(p => p.length > 0);

    let filtrados = todosLosProblemas.filter(p => {
        // 1. Filtros de botones (Año, Convocatoria, Tema)
        const cumpleAnio = aniosSeleccionados.length === 0 || aniosSeleccionados.includes(p.anio);
        const cumpleConv = convocatoriasSeleccionadas.length === 0 || convocatoriasSeleccionadas.includes(p.convocatoria);
        const cumpleTema = temasSeleccionados.length === 0 || temasSeleccionados.includes(p.tema);
        
        // 2. Filtro de Búsqueda de Texto
        let cumpleBusqueda = true;
        if (palabrasBuscadas.length > 0) {
            const textoTitulo = normalizarTexto(p.titulo);
            const textoEnunciado = normalizarTexto(p.enunciado);
            const textoCompleto = textoTitulo + ' ' + textoEnunciado;

            if (logica === 'AND') {
                // Todas las palabras deben estar presentes
                cumpleBusqueda = palabrasBuscadas.every(palabra => textoCompleto.includes(palabra));
            } else {
                // Al menos una palabra debe estar presente (OR)
                cumpleBusqueda = palabrasBuscadas.some(palabra => textoCompleto.includes(palabra));
            }
        }

        return cumpleAnio && cumpleConv && cumpleTema && cumpleBusqueda;
    });

    filtrados.sort((a, b) => {
        if (orden === 'tema') {
            return a.tema.localeCompare(b.tema) || b.anio - a.anio || a.numero - b.numero;
        } else {
            return a.numero - b.numero || b.anio - a.anio || a.tema.localeCompare(b.tema);
        }
    });

    document.getElementById('contador-resultados').textContent = `${filtrados.length} problemas encontrados`;

    if (filtrados.length === 0) {
        contenedor.innerHTML = '<p style="text-align:center; color:#64748b; padding: 20px;">No hay problemas que coincidan con los filtros.</p>';
        return;
    }

    // Caja de PDFs (solo muestra los de los exámenes visibles)
    const examenesUnicos = [...new Map(filtrados.map(p => [p.examenId, p])).values()];
    let pdfHtml = '';
    if (examenesUnicos.length > 0) {
        pdfHtml += '<div class="pdf-links-box"><strong>📄 Documentos oficiales:</strong>';
        examenesUnicos.forEach(ex => {
            const baseCode = ex.codigo ? ex.codigo.replace('.SOL', '') : ex.examenId;
            pdfHtml += `
                <a href="./PDF/${baseCode}.pdf" target="_blank">Ver Examen (${ex.anio} ${ex.convocatoria})</a>
                <a href="./PDF/${baseCode}.CRI.pdf" target="_blank">Ver Criterios</a>
            `;
        });
        pdfHtml += '</div>';
    }

    let html = pdfHtml;
    let temaActual = '';
    const claseMostrarEnunciado = mostrarEnunciado ? 'mostrar-enunciado' : '';

    filtrados.forEach(p => {
        if (orden === 'tema' && p.tema !== temaActual) {
            temaActual = p.tema;
            html += `<h2 class="grupo-tema-titulo">${p.tema}</h2>`;
        }

        let apartadosHtml = '';
        (p.apartados || []).forEach(ap => {
            apartadosHtml += `<p><strong>${txt(ap.letra)})</strong> ${txt(ap.enunciado)} ${ap.puntuacion ? `<em>(${txt(ap.puntuacion)})</em>` : ''}</p>`;
        });

        let resolucionHtml = '';
        (p.resolucion || []).forEach(paso => {
            resolucionHtml += `
                <div class="paso">
                    <strong>${txt(paso.titulo)}.</strong> ${txt(paso.contenido)}
                </div>
            `;
        });

        let resumenEnunciado = '';
        if (mostrarEnunciado) {
            const textoCorto = p.enunciado && p.enunciado.length > 150 
                ? p.enunciado.substring(0, 150) + '...' 
                : p.enunciado;
            resumenEnunciado = `<p class="resumen-enunciado">${txt(textoCorto)}</p>`;
        }

        html += `
            <details class="tarjeta-problema-desplegable ${claseMostrarEnunciado}">
                <summary>
                    <div class="etiquetas">
                        <span class="badge badge-tema">${p.tema}</span>
                        <span class="badge badge-examen">${p.anio} · ${p.convocatoria}</span>
                    </div>
                    <h4>Problema ${p.numero}: ${p.titulo}</h4>
                    ${resumenEnunciado}
                </summary>
                <div class="detalle-problema">
                    <div class="enunciado-ej">📌 Enunciado completo:</div>
                    <p>${txt(p.enunciado)}</p>
                    ${apartadosHtml}
                    
                    <div class="resolucion">
                        ${resolucionHtml}
                        <div class="resultado-final">✔️ <strong>Resultado:</strong> ${txt(p.resultado)}</div>
                    </div>
                </div>
            </details>
        `;
    });

    contenedor.innerHTML = html;
    typesetMathJax();
}

function limpiarFiltros() {
    aniosSeleccionados = [];
    convocatoriasSeleccionadas = [];
    temasSeleccionados = [];
    document.getElementById('check-mostrar-enunciado').checked = false;
    document.getElementById('input-busqueda').value = ''; // Limpiar buscador
    document.getElementById('select-logica').value = 'OR';
    
    document.querySelectorAll('.btn-filtro').forEach(btn => btn.classList.remove('activo'));
    renderizarResultados();
    actualizarBotonLimpiar();
}

function actualizarBotonLimpiar() {
    const btn = document.getElementById('btn-limpiar');
    const hayFiltros = aniosSeleccionados.length > 0 || convocatoriasSeleccionadas.length > 0 || temasSeleccionados.length > 0 || document.getElementById('input-busqueda').value.trim() !== '';
    btn.style.display = hayFiltros ? 'block' : 'none';
}

function typesetMathJax() {
    var tries = 0;
    var interval = setInterval(function () {
        tries++;
        if (window.MathJax && window.MathJax.typesetPromise) {
            clearInterval(interval);
            window.MathJax.typesetPromise([document.getElementById('resultados')])
                .catch(function (e) { console.warn('MathJax:', e); });
        } else if (tries > 150) {
            clearInterval(interval);
            console.warn('MathJax no se cargó a tiempo.');
        }
    }, 100);
}

document.addEventListener('DOMContentLoaded', cargarDatos);