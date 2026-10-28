// js/filtro-problemas-inline.js

let todosLosProblemas = [];
let aniosSeleccionados = [];
let convocatoriasSeleccionadas = [];
let temasSeleccionados = [];
let comunidadesSeleccionadas = [];
let bloquesSeleccionados = [];

// Menos tarjetas por lote en móvil: menos maquetado y menos MathJax.
const POR_PAGINA = (typeof window !== 'undefined' && window.matchMedia &&
                    window.matchMedia('(max-width: 640px)').matches) ? 20 : 40;

let filtradosActuales = [];
let mostrados = 0;
let ultimoTemaRenderizado = '';
let ultimoBloqueRenderizado = '';

const SEPARADOR_MULTI = /\s*;\s*/;

// ─── Configuración de PDFs ───
// true  → el botón del PDF se OCULTA si el archivo no existe.
// false → el botón se muestra DESACTIVADO con la etiqueta "no disponible".
const OCULTAR_PDF_FALTANTE = false;

// Caché de comprobaciones: url -> Promise<boolean>
const pdfExisteCache = new Map();

function txt(s) { return s == null ? '' : String(s); }

function escapeHtml(s) {
    return txt(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizarTexto(texto) {
    if (!texto) return '';
    return texto.toString().toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function debounce(fn, ms = 250) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

// ─── Multivalor ───
function dividirMulti(valor) {
    if (valor == null) return [];
    return String(valor).split(SEPARADOR_MULTI).map(s => s.trim()).filter(Boolean);
}

function letraBloque(bloque) {
    const m = String(bloque || '').match(/^([A-Z])/);
    return m ? m[1] : '';
}

function codigoTema(tema) {
    const m = String(tema || '').match(/^([A-Z]\d+)\b/);
    return m ? m[1] : String(tema || '');
}

function ordenarTemas(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function temasDisponiblesPorBloques() {
    if (bloquesSeleccionados.length === 0) return [];
    const letras = new Set(bloquesSeleccionados.map(letraBloque).filter(Boolean));
    const set = new Set();
    todosLosProblemas.forEach(p => {
        (p.temas || []).forEach(t => {
            if (letras.has(letraBloque(t))) set.add(t);
        });
    });
    return [...set].sort(ordenarTemas);
}

function renderFiltroTemas() {
    const contenedor = document.getElementById('filtros-tema');
    if (!contenedor) return;

    const temas = temasDisponiblesPorBloques();
    const mostrarSoloCodigo = bloquesSeleccionados.length > 1;

    contenedor.innerHTML = '';

    if (bloquesSeleccionados.length === 0) {
        const hint = document.createElement('p');
        hint.className = 'filtro-hint';
        hint.textContent = 'Selecciona primero uno o varios bloques para filtrar por tema.';
        contenedor.appendChild(hint);
        return;
    }

    if (temas.length === 0) {
        const hint = document.createElement('p');
        hint.className = 'filtro-hint';
        hint.textContent = 'No hay temas disponibles para los bloques seleccionados.';
        contenedor.appendChild(hint);
        return;
    }

    temas.forEach(temaFull => {
        const btn = document.createElement('button');
        btn.className = 'btn-filtro';
        if (temasSeleccionados.includes(temaFull)) btn.classList.add('activo');
        btn.textContent = mostrarSoloCodigo ? codigoTema(temaFull) : temaFull;
        btn.title = temaFull;
        btn.onclick = () => toggleFiltro(temaFull, 'tema', btn);
        contenedor.appendChild(btn);
    });
}

function normalizarEjercicio(ej, examen) {
    const temaRaw = ej.Tema || ej.tema || '';
    const bloqueRaw = ej.Bloque || ej.bloque || '';
    const temas = dividirMulti(temaRaw);
    const bloques = dividirMulti(bloqueRaw);
    return {
        ...ej,
        tema: temaRaw,
        temas,
        temaPrincipal: temas[0] || '',
        bloque: bloqueRaw,
        bloques,
        bloquePrincipal: bloques[0] || '',
        examenId: examen.id,
        anio: examen.anio,
        convocatoria: examen.convocatoria,
        comunidad: examen.comunidad,
        codigo: examen.codigo,
        asignatura: examen.asignatura,
        nivel: examen.nivel,
        curso: examen.curso,
        enunciado_general: examen.enunciado_general
    };
}

// Acepta problemas de `normalizarEjercicio` o del `problemas.json` consolidado.
function enriquecerProblema(p) {
    const temas = (p.temas && p.temas.length) ? p.temas : dividirMulti(p.Tema || p.tema || '');
    const bloques = (p.bloques && p.bloques.length) ? p.bloques : dividirMulti(p.Bloque || p.bloque || '');
    return {
        ...p,
        temas,
        bloques,
        temaPrincipal: p.temaPrincipal || temas[0] || '',
        bloquePrincipal: p.bloquePrincipal || bloques[0] || '',
    };
}

const CAMPOS_BUSQUEDA = {
    todo: p => [
        p.titulo, p.enunciado, p.comunidad,
        ...(p.temas || []),
        ...(p.bloques || []),
        p.asignatura, p.nivel, p.curso, p.resultado
    ],
    titulo: p => [p.titulo],
    enunciado: p => [p.enunciado],
    tema: p => p.temas || [],
    bloque: p => p.bloques || [],
    resultado: p => [p.resultado],
    comunidad: p => [p.comunidad],
    asignatura: p => [p.asignatura],
    nivel: p => [p.nivel],
    curso: p => [p.curso]
};

function textoDeCampo(p, campo) {
    const fn = CAMPOS_BUSQUEDA[campo] || CAMPOS_BUSQUEDA.todo;
    return fn(p).map(normalizarTexto).join(' ');
}

// ─── Comprobación de PDFs ──────────────────────────────────────
async function comprobarPdf(url) {
    if (pdfExisteCache.has(url)) return pdfExisteCache.get(url);

    const promesa = (async () => {
        // En file:// no se puede hacer HEAD de forma fiable: asumimos que existe.
        if (location.protocol === 'file:') return true;
        try {
            let r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
            if (r.ok) return true;
            // Si el servidor no soporta HEAD (405/501), prueba con GET parcial.
            if (r.status === 405 || r.status === 501) {
                r = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
                return r.ok || r.status === 206;
            }
            return false;
        } catch {
            return false;
        }
    })();

    pdfExisteCache.set(url, promesa);
    return promesa;
}

// Observador perezoso: solo comprueba el PDF cuando el enlace entra en viewport.
let pdfObserver = null;
function getPdfObserver() {
    if (pdfObserver) return pdfObserver;
    if (typeof IntersectionObserver === 'undefined') return null;

    pdfObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const a = entry.target;
            pdfObserver.unobserve(a);
            const url = a.getAttribute('data-pdf-url');
            comprobarPdf(url).then(ok => {
                if (ok) {
                    a.classList.add('pdf-ok');
                    return;
                }
                a.classList.add('pdf-missing');
                a.removeAttribute('href');
                a.removeAttribute('target');
                a.setAttribute('aria-disabled', 'true');
                a.title = 'PDF no disponible';
                if (OCULTAR_PDF_FALTANTE) {
                    a.style.display = 'none';
                } else {
                    const emoji = a.textContent.includes('📝') ? '📝' : '📄';
                    a.textContent = `${emoji} no disponible`;
                }
            });
        });
    }, { rootMargin: '200px' });

    return pdfObserver;
}

function observarPdfsEn(nodos) {
    const obs = getPdfObserver();
    if (!obs) return; // sin IntersectionObserver: dejamos los enlaces tal cual
    nodos.forEach(n => {
        if (n.nodeType !== 1) return;
        n.querySelectorAll('.pdf-mini-buttons a[data-pdf-url]').forEach(a => obs.observe(a));
    });
}

// ─── Carga de datos ────────────────────────────────────────────
async function cargarProblemasCrudos() {
    // 1) JSON consolidado (recomendado): 1 sola petición.
    try {
        const r = await fetch('./Datos/problemas.json', { cache: 'no-cache' });
        if (r.ok) {
            const flat = await r.json();
            if (Array.isArray(flat) && flat.length) {
                return flat.map(enriquecerProblema);
            }
        }
    } catch { /* no existe: seguimos con el fallback */ }

    // 2) Fallback: índice + N ficheros, con concurrencia limitada (6).
    const resIndice = await fetch('./Datos/indice.json');
    if (!resIndice.ok) throw new Error('No se encontró indice.json');
    const indice = await resIndice.json();

    const CONCURRENCIA = 6;
    const resultados = new Array(indice.length).fill(null);
    let cursor = 0;

    async function worker() {
        while (true) {
            const i = cursor++;
            if (i >= indice.length) return;
            const ex = indice[i];
            try {
                const res = await fetch(`./Datos/${ex.id}.json`);
                if (!res.ok) throw new Error(`No se encontró ${ex.id}.json`);
                const data = await res.json();
                data.id = ex.id;
                if (ex.codigo) data.codigo = ex.codigo;
                if (!data.comunidad && ex.comunidad) data.comunidad = ex.comunidad;
                if (!data.anio && ex.anio) data.anio = ex.anio;
                if (!data.convocatoria && ex.convocatoria) data.convocatoria = ex.convocatoria;
                resultados[i] = data;
            } catch (e) {
                console.warn(e);
            }
        }
    }

    const workers = [];
    for (let k = 0; k < CONCURRENCIA; k++) workers.push(worker());
    await Promise.all(workers);

    return resultados
        .filter(Boolean)
        .flatMap(examen =>
            (examen.ejercicios || []).map(ej => enriquecerProblema(normalizarEjercicio(ej, examen)))
        );
}

function precalcularIndiceBusqueda() {
    todosLosProblemas.forEach(p => {
        const campos = [
            p.titulo, p.enunciado, p.comunidad, p.asignatura,
            p.nivel, p.curso, p.resultado,
            ...(p.temas || []),
            ...(p.bloques || [])
        ];
        p._searchAll = normalizarTexto(campos.filter(Boolean).join(' '));
    });
}

async function cargarDatos() {
    const contenedor = document.getElementById('resultados');
    contenedor.innerHTML = '<p style="text-align:center; color:#64748b; padding: 20px;">Cargando problemas...</p>';

    try {
        todosLosProblemas = await cargarProblemasCrudos();
        precalcularIndiceBusqueda();
        inicializarFiltros();
        renderizarResultados();
    } catch (error) {
        console.error('Error cargando los datos:', error);
        contenedor.innerHTML = `<p style="text-align:center; color:red;">Error al cargar: ${escapeHtml(error.message)}</p>`;
    }
}

// ─── Filtros ───────────────────────────────────────────────────
function inicializarFiltros() {
    // Años
    const anios = [...new Set(todosLosProblemas.map(p => p.anio))]
        .filter(a => a != null)
        .sort((a, b) => b - a);
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
    const convocatorias = [...new Set(todosLosProblemas.map(p => p.convocatoria))]
        .filter(c => c)
        .sort();
    const contenedorConvocatorias = document.getElementById('filtros-convocatoria');
    contenedorConvocatorias.innerHTML = '';
    convocatorias.forEach(conv => {
        const btn = document.createElement('button');
        btn.className = 'btn-filtro';
        btn.textContent = conv;
        btn.onclick = () => toggleFiltro(conv, 'convocatoria', btn);
        contenedorConvocatorias.appendChild(btn);
    });

    // Comunidades
    const comunidades = [...new Set(
        todosLosProblemas.map(p => p.comunidad).filter(c => c)
    )].sort((a, b) => a.localeCompare(b));

    let contenedorComunidades = document.getElementById('filtros-comunidad');
    if (!contenedorComunidades && comunidades.length > 0) {
        contenedorComunidades = document.createElement('div');
        contenedorComunidades.id = 'filtros-comunidad';
        contenedorComunidades.className = 'botones';
        const ref = document.getElementById('filtros-convocatoria') || document.getElementById('filtros-tema');
        if (ref && ref.parentNode) {
            ref.parentNode.insertBefore(contenedorComunidades, ref.nextSibling);
        }
    }
    if (contenedorComunidades && comunidades.length > 0) {
        contenedorComunidades.innerHTML = '';
        comunidades.forEach(com => {
            const btn = document.createElement('button');
            btn.className = 'btn-filtro';
            btn.textContent = com;
            btn.onclick = () => toggleFiltro(com, 'comunidad', btn);
            contenedorComunidades.appendChild(btn);
        });
    }

    // Bloques
    const bloquesMap = new Map();
    todosLosProblemas.forEach(p => (p.bloques || []).forEach(b => {
        if (!bloquesMap.has(b)) bloquesMap.set(b, b);
    }));
    const bloques = [...bloquesMap.keys()].sort((a, b) => a.localeCompare(b));

    let contenedorBloques = document.getElementById('filtros-bloque');
    if (!contenedorBloques && bloques.length > 0) {
        contenedorBloques = document.createElement('div');
        contenedorBloques.id = 'filtros-bloque';
        contenedorBloques.className = 'botones';
        const ref = document.getElementById('filtros-comunidad') || document.getElementById('filtros-tema');
        if (ref && ref.parentNode) {
            ref.parentNode.insertBefore(contenedorBloques, ref.nextSibling);
        }
    }
    if (contenedorBloques && bloques.length > 0) {
        contenedorBloques.innerHTML = '';
        bloques.forEach(bloq => {
            const btn = document.createElement('button');
            btn.className = 'btn-filtro';
            btn.textContent = bloq;
            btn.title = bloq;
            btn.onclick = () => toggleFiltro(bloq, 'bloque', btn);
            contenedorBloques.appendChild(btn);
        });
    }

    // Temas: dependientes de los bloques
    renderFiltroTemas();

    // Eventos
    document.getElementById('select-orden').addEventListener('change', renderizarResultados);
    document.getElementById('check-mostrar-enunciado').addEventListener('change', (e) => {
        document.getElementById('resultados').classList.toggle('mostrar-enunciado', e.target.checked);
    });
    document.getElementById('btn-limpiar').addEventListener('click', limpiarFiltros);
    document.getElementById('input-busqueda').addEventListener('input', debounce(renderizarResultados, 250));
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
    } else if (tipo === 'comunidad') {
        if (comunidadesSeleccionadas.includes(valor)) {
            comunidadesSeleccionadas = comunidadesSeleccionadas.filter(c => c !== valor);
            boton.classList.remove('activo');
        } else {
            comunidadesSeleccionadas.push(valor);
            boton.classList.add('activo');
        }
    } else if (tipo === 'bloque') {
        if (bloquesSeleccionados.includes(valor)) {
            bloquesSeleccionados = bloquesSeleccionados.filter(b => b !== valor);
            boton.classList.remove('activo');
        } else {
            bloquesSeleccionados.push(valor);
            boton.classList.add('activo');
        }
        const disponibles = new Set(temasDisponiblesPorBloques());
        temasSeleccionados = temasSeleccionados.filter(t => disponibles.has(t));
        renderFiltroTemas();
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

// ─── Render ────────────────────────────────────────────────────
function renderizarResultados() {
    const orden = document.getElementById('select-orden').value;
    const mostrarEnunciado = document.getElementById('check-mostrar-enunciado').checked;
    const contenedor = document.getElementById('resultados');

    const query = normalizarTexto(document.getElementById('input-busqueda').value);
    const logica = document.getElementById('select-logica').value;
    const palabrasBuscadas = query.split(/\s+/).filter(p => p.length > 0);

    let filtrados = todosLosProblemas.filter(p => {
        const cumpleAnio = aniosSeleccionados.length === 0 || aniosSeleccionados.includes(p.anio);
        const cumpleConv = convocatoriasSeleccionadas.length === 0 || convocatoriasSeleccionadas.includes(p.convocatoria);
        const cumpleComunidad = comunidadesSeleccionadas.length === 0 || comunidadesSeleccionadas.includes(p.comunidad);

        const cumpleTema = temasSeleccionados.length === 0
            || temasSeleccionados.some(sel => (p.temas || []).includes(sel));
        const cumpleBloque = bloquesSeleccionados.length === 0
            || bloquesSeleccionados.some(sel => (p.bloques || []).includes(sel));

        let cumpleBusqueda = true;
        if (palabrasBuscadas.length > 0) {
            const t = p._searchAll || '';
            cumpleBusqueda = logica === 'AND'
                ? palabrasBuscadas.every(w => t.includes(w))
                : palabrasBuscadas.some(w => t.includes(w));
        }
        return cumpleAnio && cumpleConv && cumpleComunidad && cumpleTema && cumpleBloque && cumpleBusqueda;
    });

    filtrados.sort((a, b) => {
        if (orden === 'tema') {
            return a.temaPrincipal.localeCompare(b.temaPrincipal)
                || b.anio - a.anio
                || a.numero - b.numero;
        }
        return a.numero - b.numero
            || b.anio - a.anio
            || a.temaPrincipal.localeCompare(b.temaPrincipal);
    });

    filtradosActuales = filtrados;
    mostrados = 0;
    ultimoTemaRenderizado = '';
    ultimoBloqueRenderizado = '';

    contenedor.innerHTML = '';
    contenedor.classList.toggle('mostrar-enunciado', mostrarEnunciado);

    if (filtrados.length === 0) {
        contenedor.innerHTML = '<p style="text-align:center; color:#64748b; padding: 20px;">No hay problemas que coincidan con los filtros.</p>';
        document.getElementById('contador-resultados').textContent = '0 problemas encontrados';
        return;
    }

    const btnContainer = document.createElement('div');
    btnContainer.id = 'cargar-mas-container';
    btnContainer.className = 'cargar-mas-container';
    contenedor.appendChild(btnContainer);

    cargarMas();
}

function cargarMas() {
    const desde = mostrados;
    const hasta = Math.min(mostrados + POR_PAGINA, filtradosActuales.length);
    if (desde >= hasta) return;
    mostrados = hasta;

    const nuevosNodos = construirLote(desde, hasta);
    const contenedor = document.getElementById('resultados');
    const btnContainer = document.getElementById('cargar-mas-container');

    nuevosNodos.forEach(n => {
        if (btnContainer) contenedor.insertBefore(n, btnContainer);
        else contenedor.appendChild(n);
    });

    const nuevasTarjetas = nuevosNodos.filter(n =>
        n.nodeType === 1 &&
        n.classList &&
        n.classList.contains('tarjeta-problema-desplegable')
    );

    // Carga perezosa del detalle al abrir la tarjeta.
    nuevasTarjetas.forEach(card => {
        card.addEventListener('toggle', () => {
            if (!card.open) return;
            const detalle = card.querySelector('.detalle-problema');
            if (!detalle || detalle.dataset.loaded === '1') return;
            detalle.dataset.loaded = '1';
            detalle.innerHTML = card._construirDetalle();
            typesetMathJax([detalle]);
        });
    });

    // Typeset sólo del summary (barato). El detalle se procesa al abrirse.
    if (nuevasTarjetas.length > 0) typesetMathJax(nuevasTarjetas);

    // Comprobación perezosa de PDFs vía IntersectionObserver.
    observarPdfsEn(nuevosNodos);

    actualizarBotonCargarMas();
    actualizarContador();
}

function construirSummaryHtml(p) {
    const baseCode = p.codigo ? p.codigo.replace('.SOL', '') : p.examenId;
    const baseCodeSafe = escapeHtml(baseCode);
    const urlExamen = `./PDF/${baseCodeSafe}.pdf`;
    const urlCriterios = `./PDF/${baseCodeSafe}.CRI.pdf`;
    const pdfLinks = `
        <div class="pdf-mini-buttons" onclick="event.stopPropagation()">
            <a href="${urlExamen}" target="_blank" title="Descargar Examen Original"
               data-pdf-url="${urlExamen}">📄 PDF Examen</a>
            <a href="${urlCriterios}" target="_blank" title="Descargar Criterios de Corrección"
               data-pdf-url="${urlCriterios}">📝 PDF Criterios</a>
        </div>
    `;
    const urlExamenCompleto = `examen.html?id=${encodeURIComponent(txt(p.examenId))}#p${encodeURIComponent(txt(p.numero))}`;

    const textoCorto = p.enunciado && p.enunciado.length > 150
        ? p.enunciado.substring(0, 150) + '...'
        : p.enunciado;
    const resumenEnunciado = `<p class="resumen-enunciado">${escapeHtml(textoCorto)}</p>`;

    const partesBadgeExamen = [txt(p.anio), txt(p.convocatoria), txt(p.comunidad)].filter(Boolean);
    const badgeExamen = partesBadgeExamen.join(' · ');
    const badgePuntos = p.puntuacion
        ? `<span class="badge badge-puntos">${escapeHtml(p.puntuacion)}</span>`
        : '';

    const badgesTema = (p.temas || []).map(t =>
        `<span class="badge badge-tema" title="${escapeHtml(t)}">${escapeHtml(codigoTema(t))}</span>`
    ).join('');
    const badgesBloque = (p.bloques || []).map(b =>
        `<span class="badge badge-bloque">${escapeHtml(b)}</span>`
    ).join('');

    return `
        <summary>
            <div class="etiquetas">
                ${badgesBloque}
                ${badgesTema}
                <span class="badge badge-examen">${escapeHtml(badgeExamen)}</span>
                ${badgePuntos}
            </div>
            <div class="header-top-row">
                <h4>Problema ${escapeHtml(p.numero)}: ${escapeHtml(p.titulo)}</h4>
                <a href="${urlExamenCompleto}" class="btn-ver-examen" onclick="event.stopPropagation()">Ver examen completo ↗</a>
            </div>
            ${pdfLinks}
            ${resumenEnunciado}
        </summary>
    `;
}

function construirDetalleHtml(p) {
    let apartadosHtml = '';
    (p.apartados || []).forEach(ap => {
        apartadosHtml += `<p><strong>${escapeHtml(ap.letra)})</strong> ${escapeHtml(ap.enunciado)} ${
            ap.puntuacion ? `<em>(${escapeHtml(ap.puntuacion)})</em>` : ''
        }</p>`;
    });

    let resolucionHtml = '';
    (p.resolucion || []).forEach(paso => {
        resolucionHtml += `
            <div class="paso">
                <strong>${escapeHtml(paso.titulo)}.</strong> ${escapeHtml(paso.contenido)}
            </div>
        `;
    });

    return `
        <div class="enunciado-ej">📌 Enunciado completo:</div>
        <p>${escapeHtml(p.enunciado)}</p>
        ${apartadosHtml}
        <div class="resolucion">
            ${resolucionHtml}
            <div class="resultado-final">✔️ <strong>Resultado:</strong> ${escapeHtml(p.resultado)}</div>
        </div>
    `;
}

function construirLote(desde, hasta) {
    const orden = document.getElementById('select-orden').value;
    const lote = filtradosActuales.slice(desde, hasta);
    let html = '';

    lote.forEach((p, idx) => {
        if (orden === 'tema' && p.temaPrincipal !== ultimoTemaRenderizado) {
            ultimoTemaRenderizado = p.temaPrincipal;
            html += `<h2 class="grupo-tema-titulo">${escapeHtml(p.temaPrincipal || 'Sin tema')}</h2>`;
        }
        if (orden === 'bloque' && p.bloquePrincipal !== ultimoBloqueRenderizado) {
            ultimoBloqueRenderizado = p.bloquePrincipal;
            html += `<h2 class="grupo-bloque-titulo">${escapeHtml(p.bloquePrincipal || 'Sin bloque')}</h2>`;
        }

        html += `<details class="tarjeta-problema-desplegable" data-idx="${idx}">
            ${construirSummaryHtml(p)}
            <div class="detalle-problema" data-loaded="0"></div>
        </details>`;
    });

    const template = document.createElement('template');
    template.innerHTML = html;
    const nodes = [...template.content.childNodes];

    // Asociar el constructor del detalle a cada tarjeta.
    nodes.forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.classList && n.classList.contains('tarjeta-problema-desplegable')) {
            const idx = Number(n.dataset.idx);
            const p = lote[idx];
            n._construirDetalle = () => construirDetalleHtml(p);
        }
    });

    return nodes;
}

function actualizarBotonCargarMas() {
    const btnContainer = document.getElementById('cargar-mas-container');
    if (!btnContainer) return;
    const restantes = filtradosActuales.length - mostrados;
    if (restantes <= 0) {
        btnContainer.innerHTML = '';
        return;
    }
    btnContainer.innerHTML = `
        <button class="btn-cargar-mas" onclick="cargarMas()">
            Cargar más (${restantes} restante${restantes === 1 ? '' : 's'})
        </button>`;
}

function actualizarContador() {
    const total = filtradosActuales.length;
    let texto = `${total} problema${total === 1 ? '' : 's'} encontrado${total === 1 ? '' : 's'}`;
    if (total > mostrados) texto += ` · mostrando ${mostrados}`;
    document.getElementById('contador-resultados').textContent = texto;
}

function limpiarFiltros() {
    aniosSeleccionados = [];
    convocatoriasSeleccionadas = [];
    temasSeleccionados = [];
    comunidadesSeleccionadas = [];
    bloquesSeleccionados = [];
    document.getElementById('check-mostrar-enunciado').checked = false;
    document.getElementById('input-busqueda').value = '';
    document.getElementById('select-logica').value = 'OR';
    document.querySelectorAll('.btn-filtro').forEach(btn => btn.classList.remove('activo'));
    renderFiltroTemas();
    renderizarResultados();
    actualizarBotonLimpiar();
}

function actualizarBotonLimpiar() {
    const btn = document.getElementById('btn-limpiar');
    const hayFiltros = aniosSeleccionados.length > 0
        || convocatoriasSeleccionadas.length > 0
        || temasSeleccionados.length > 0
        || comunidadesSeleccionadas.length > 0
        || bloquesSeleccionados.length > 0
        || document.getElementById('input-busqueda').value.trim() !== '';
    btn.style.display = hayFiltros ? 'block' : 'none';
}

async function typesetMathJax(nodos) {
    if (!window.MathJax) {
        let tries = 0;
        while (!window.MathJax && tries < 150) {
            await new Promise(r => setTimeout(r, 100));
            tries++;
        }
        if (!window.MathJax) {
            console.warn('MathJax no se cargó a tiempo.');
            return;
        }
    }
    if (window.MathJax.startup && window.MathJax.startup.promise) {
        await window.MathJax.startup.promise;
    }
    if (!window.MathJax.typesetPromise) return;

    const lista = Array.isArray(nodos) ? nodos : (nodos ? [nodos] : []);
    const validos = lista.filter(Boolean);
    if (validos.length === 0) return;

    await window.MathJax.typesetPromise(validos)
        .catch(e => console.warn('MathJax:', e));
}

document.addEventListener('DOMContentLoaded', cargarDatos);