// js/filtro-problemas.js
let todosLosProblemas = [];
let aniosSeleccionados = [];
let temasSeleccionados = [];

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
                    data.codigo = ex.codigo; // Guardamos el código (ej: EXA.FIS.CYL.2026.EXT.SOL)
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
                codigo: examen.codigo // Pasamos el código a cada problema
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

    document.getElementById('select-orden').addEventListener('change', renderizarResultados);
    document.getElementById('btn-limpiar').addEventListener('click', limpiarFiltros);
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
    const contenedor = document.getElementById('resultados');
    
    let filtrados = todosLosProblemas.filter(p => {
        const cumpleAnio = aniosSeleccionados.length === 0 || aniosSeleccionados.includes(p.anio);
        const cumpleTema = temasSeleccionados.length === 0 || temasSeleccionados.includes(p.tema);
        return cumpleAnio && cumpleTema;
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

    // --- NUEVO: Generar caja de PDFs de los exámenes filtrados ---
    const examenesUnicos = [...new Map(filtrados.map(p => [p.examenId, p])).values()];
    let pdfHtml = '';
    if (examenesUnicos.length > 0) {
        pdfHtml += '<div class="pdf-links-box"><strong>📄 Documentos oficiales:</strong>';
        examenesUnicos.forEach(ex => {
            // Limpiamos el código (quitando .SOL) para armar el nombre del PDF
            const baseCode = ex.codigo ? ex.codigo.replace('.SOL', '') : ex.examenId;
            pdfHtml += `
                <a href="./PDF/${baseCode}.pdf" target="_blank">Ver Examen (${ex.anio} ${ex.convocatoria})</a>
                <a href="./PDF/${baseCode}.CRI.pdf" target="_blank">Ver Criterios</a>
            `;
        });
        pdfHtml += '</div>';
    }

    let html = pdfHtml; // Añadimos la caja de PDFs al principio
    let temaActual = '';

    filtrados.forEach(p => {
        if (orden === 'tema' && p.tema !== temaActual) {
            temaActual = p.tema;
            html += `<h2 class="grupo-tema-titulo">${p.tema}</h2>`;
        }

        const urlDestino = `examen.html?id=${p.examenId}#p${p.numero}`;

        const enunciadoCorto = p.enunciado && p.enunciado.length > 100 
            ? p.enunciado.substring(0, 100) + '...' 
            : p.enunciado;

        html += `
            <a href="${urlDestino}" class="tarjeta-problema">
                <div class="etiquetas">
                    <span class="badge badge-tema">${p.tema}</span>
                    <span class="badge badge-examen">${p.anio} · ${p.convocatoria}</span>
                </div>
                <h4>Problema ${p.numero}: ${p.titulo}</h4>
                <p>${enunciadoCorto}</p>
            </a>
        `;
    });

    contenedor.innerHTML = html;
}

function limpiarFiltros() {
    aniosSeleccionados = [];
    temasSeleccionados = [];
    document.querySelectorAll('.btn-filtro').forEach(btn => btn.classList.remove('activo'));
    renderizarResultados();
    actualizarBotonLimpiar();
}

function actualizarBotonLimpiar() {
    const btn = document.getElementById('btn-limpiar');
    btn.style.display = (aniosSeleccionados.length > 0 || temasSeleccionados.length > 0) ? 'block' : 'none';
}

document.addEventListener('DOMContentLoaded', cargarDatos);