// ════════════════════════════════════════════════════════════════════════
// SECTOR 0 · IDENTIFICACIÓN DEL SCRIPT
// ════════════════════════════════════════════════════════════════════════
// Archivo   : js/filtro-problemas-inline.js
// Ubicación : raíz/js/
// Tipo      : Script de navegador (JS clásico, sin build, sin módulos)
// Entrada   : Datos/indice.json + Datos/<id>.json  (o Datos/problemas.json)
// Salida    : #resultados de la plantilla del buscador
//             ("problemas-inline v04-Filtro prefijado.html")
// Depende   : · MathJax 3 (opcional, para fórmulas)
//             · IntersectionObserver (opcional, para comprobar PDFs)
//             · fetch (obligatorio)
// Carga     : <script src="js/filtro-problemas-inline.js"></script>
//             Se autoarranca en DOMContentLoaded.
//
// Es el CEREBRO del buscador: carga problemas, construye filtros,
// parsea la consulta, filtra, ordena y pinta tarjetas desplegables.
// ════════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════════
// SECTOR 1 · QUÉ HACE
// ════════════════════════════════════════════════════════════════════════
//   1. Carga TODOS los problemas del repositorio (índice + N JSON, con
//      concurrencia limitada a 6, o un `problemas.json` consolidado).
//   2. Normaliza cada ejercicio (temas/bloques como arrays multivalor,
//      alias Tema/tema, Bloque/bloque, examenId, etc.).
//   3. Descarta problemas vacíos (`problemaVacio`).
//   4. Precalcula índices de búsqueda normalizados por ámbito:
//        enunciado · resolucion · ambas · todo
//   5. Rellena los controles de filtro (años, convocatorias, comunidades,
//      bloques, temas). Los temas dependen de los bloques seleccionados.
//   6. En cada cambio (input debounce 250 ms, select, check, click en un
//      botón de filtro), re-filtra y re-ordena, y pinta en lotes:
//        40 tarjetas por lote en escritorio · 20 en móvil (< 640 px).
//   7. Cada tarjeta es un <details> con summary (badges + PDFs + resumen)
//      y un detalle cargado en diferido la primera vez que se abre.
//   8. Tras pintar, tipografía fórmulas con MathJax y comprueba en
//      diferido (IntersectionObserver) si los PDFs existen.
// ════════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════════
// SECTOR 2 · ESTADO GLOBAL (arrays de filtros + paginación)
// ════════════════════════════════════════════════════════════════════════
// · `todosLosProblemas`  → dataset completo ya normalizado y filtrado.
// · `*Seleccionados[]`   → valores activos en cada filtro (multiselección).
// · `filtradosActuales`  → subconjunto ordenado que se está paginando.
// · `mostrados`          → cuántas tarjetas se han pintado ya.
// · `ultimoTemaRenderizado` / `ultimoBloqueRenderizado`
//                        → para insertar los <h2> de cabecera de grupo
//                          solo cuando cambia el tema/bloque actual.
// ════════════════════════════════════════════════════════════════════════

let todosLosProblemas = [];
let aniosSeleccionados = [];
let convocatoriasSeleccionadas = [];
let temasSeleccionados = [];
let comunidadesSeleccionadas = [];
let bloquesSeleccionados = [];


// ════════════════════════════════════════════════════════════════════════
// SECTOR 3 · CONFIGURACIÓN DE PAGINACIÓN
// ════════════════════════════════════════════════════════════════════════
// Móvil: 20 tarjetas por lote (menos maquetado y menos MathJax de golpe).
// Escritorio: 40 tarjetas por lote.
// Se evalúa UNA sola vez al cargar el script; no reacciona a resize.
// ════════════════════════════════════════════════════════════════════════

const POR_PAGINA = (typeof window !== 'undefined' && window.matchMedia &&
                    window.matchMedia('(max-width: 640px)').matches) ? 20 : 40;

let filtradosActuales = [];
let mostrados = 0;
let ultimoTemaRenderizado = '';
let ultimoBloqueRenderizado = '';

const SEPARADOR_MULTI = /\s*;\s*/;


// ════════════════════════════════════════════════════════════════════════
// SECTOR 4 · CONFIGURACIÓN DE PDFs
// ════════════════════════════════════════════════════════════════════════
// true  → el botón del PDF se OCULTA si el archivo no existe.
// false → el botón se muestra DESACTIVADO con la etiqueta "no disponible".
// `pdfExisteCache` evita repetir la comprobación HEAD/GET en cada scroll.
// ════════════════════════════════════════════════════════════════════════

const OCULTAR_PDF_FALTANTE = false;

// Caché de comprobaciones: url -> Promise<boolean>
const pdfExisteCache = new Map();


// ════════════════════════════════════════════════════════════════════════
// SECTOR 5 · HELPERS DE TEXTO
// ════════════════════════════════════════════════════════════════════════
// · txt         → convierte null/undefined en '' y el resto en String.
// · escapeHtml  → escapa & < > " ' para inyectar con seguridad en HTML.
// · normalizarTexto
//               → minúsculas + quita acentos (NFD + rango combinado).
// · normalizarFrase
//               → para búsquedas con "comillas": letras y números con
//                 espacios colapsados, con espacio al inicio y al final.
//                 Permite que `"fuerza gravitatoria"` case con
//                 "la fuerza, gravitatoria, que…" (por la coma),
//                 pero NO con "gravitatoria fuerza" (orden invertido).
// · debounce    → retrasa la llamada hasta N ms sin nuevas invocaciones.
//                 Se usa para el input de búsqueda (250 ms).
// ════════════════════════════════════════════════════════════════════════

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

function normalizarFrase(texto) {
    if (!texto) return ' ';
    const limpio = normalizarTexto(texto)
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return ' ' + limpio + ' ';
}

function debounce(fn, ms = 250) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}


// ════════════════════════════════════════════════════════════════════════
// SECTOR 6 · HELPERS DOM DEFENSIVOS
// ════════════════════════════════════════════════════════════════════════
// Permiten que el script no rompa si la plantilla HTML no tiene algún id.
// · $id        → elemento o null.
// · on         → addEventListener solo si existe; devuelve el elemento.
// · valorDe    → .value o fallback.
// · setValor   → asigna .value si el elemento existe.
// ════════════════════════════════════════════════════════════════════════

function $id(id) { return document.getElementById(id); }

function on(id, event, handler, options) {
    const el = $id(id);
    if (el) el.addEventListener(event, handler, options);
    return el;
}

function valorDe(id, fallback) {
    const el = $id(id);
    return el && typeof el.value === 'string' ? el.value : fallback;
}

function setValor(id, value) {
    const el = $id(id);
    if (el) el.value = value;
}


// ════════════════════════════════════════════════════════════════════════
// SECTOR 7 · HELPERS MULTIVALOR (temas, bloques, códigos)
// ════════════════════════════════════════════════════════════════════════
// Un campo "Tema" o "Bloque" puede contener varios valores separados por
// `;`. Ej.: "A1.1; A1.2" o "A; B". `dividirMulti` los separa y limpia.
// · letraBloque    → primera letra mayúscula de un bloque ("A1" → "A").
// · codigoTema     → prefijo tipo "A1", "B3"… de un tema; si no matchea,
//                    devuelve el tema completo.
// · ordenarTemas   → orden natural (A1 < A2 < A10).
// ════════════════════════════════════════════════════════════════════════

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


// ════════════════════════════════════════════════════════════════════════
// SECTOR 8 · DETECCIÓN DE PROBLEMAS VACÍOS
// ════════════════════════════════════════════════════════════════════════
// Un problema es "vacío" si NO tiene NADA de:
//   título · enunciado · resultado · tema · bloque ·
//   apartados con letra/enunciado · resolución con título/contenido.
// El id/examenId/codigo NO cuenta como contenido visible.
// Se aplica:
//   · al cargar (cargarProblemasCrudos → filter)
//   · y otra vez al filtrar (renderizarResultados → filter)
// Por eso el dataset nunca "contamina" la vista con cascarones.
// ════════════════════════════════════════════════════════════════════════

function problemaVacio(p) {
    if (!p) return true;

    const vacio = v => v == null || String(v).trim() === '';

    const tieneTitulo     = !vacio(p.titulo);
    const tieneEnunciado  = !vacio(p.enunciado);
    const tieneResultado  = !vacio(p.resultado);
    const tieneTema       = !vacio(p.temaPrincipal || p.tema || p.Tema);
    const tieneBloque     = !vacio(p.bloquePrincipal || p.bloque || p.Bloque);

    const tieneApartados = Array.isArray(p.apartados) && p.apartados.some(a =>
        a && (!vacio(a.enunciado) || !vacio(a.letra))
    );

    const tieneResolucion = Array.isArray(p.resolucion) && p.resolucion.some(r =>
        r && (!vacio(r.contenido) || !vacio(r.titulo))
    );

    return !(tieneTitulo || tieneEnunciado || tieneResultado ||
             tieneTema || tieneBloque || tieneApartados || tieneResolucion);
}


// ════════════════════════════════════════════════════════════════════════
// SECTOR 9 · FILTRO DE TEMAS DEPENDIENTE DE BLOQUES
// ════════════════════════════════════════════════════════════════════════
// · `temasDisponiblesPorBloques()` devuelve los temas cuyo bloque (letra
//   inicial) está entre los bloques seleccionados.
// · `renderFiltroTemas()`:
//     – sin bloques   → muestra un hint "selecciona bloques primero"
//     – sin temas     → muestra hint "no hay temas para esos bloques"
//     – con temas     → pinta un botón por tema; si hay varios bloques
//                       seleccionados, el botón muestra solo el código
//                       corto (p.ej. "A1") y el tema completo va al title.
// Al cambiar bloques, `toggleFiltro` limpia temas que hayan quedado fuera.
// ════════════════════════════════════════════════════════════════════════

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
    const contenedor = $id('filtros-tema');
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


// ════════════════════════════════════════════════════════════════════════
// SECTOR 10 · NORMALIZACIÓN DE EJERCICIOS Y PROBLEMAS
// ════════════════════════════════════════════════════════════════════════
// · `normalizarEjercicio(ej, examen)`
//     – Toma un ejercicio dentro de su examen y lo aplana:
//         { ...ej, temas[], bloques[], temaPrincipal, bloquePrincipal,
//           examenId, anio, convocatoria, comunidad, codigo, asignatura,
//           nivel, curso, enunciado_general }
//     – Aliases tolerados: Tema/tema · Bloque/bloque.
//     – Los campos "*Principal" (los primeros del array) se usan para
//       agrupar por cabecera en la vista (h2 de tema / bloque).
//
// · `enriquecerProblema(p)`
//     – Idempotente. Se llama sobre cualquier problema, ya venga de
//       normalizarEjercicio o de problemas.json ya consolidado.
//     – Garantiza `temas`, `bloques`, `temaPrincipal`, `bloquePrincipal`.
//     – Garantiza `examenId` probando varios alias (examen_id, examId…)
//       porque el consolidado antiguo no lo incluía → rompía "Ver examen".
// ════════════════════════════════════════════════════════════════════════

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

function enriquecerProblema(p) {
    const temas = (p.temas && p.temas.length) ? p.temas : dividirMulti(p.Tema || p.tema || '');
    const bloques = (p.bloques && p.bloques.length) ? p.bloques : dividirMulti(p.Bloque || p.bloque || '');
    return {
        ...p,
        temas,
        bloques,
        temaPrincipal: p.temaPrincipal || temas[0] || '',
        bloquePrincipal: p.bloquePrincipal || bloques[0] || '',
        // Aseguramos que siempre exista examenId (distintos alias por si
        // algún consolidado lo llama de otra forma).
        examenId: p.examenId || p.examen_id || p.examId || p.exam_id || p.examenid || ''
    };
}


// ════════════════════════════════════════════════════════════════════════
// SECTOR 11 · PARSER DE CONSULTAS (input de búsqueda)
// ════════════════════════════════════════════════════════════════════════
// Gramática mínima:
//   · términos separados por espacios   → ver `defaultLogic`
//   · `+`  → AND explícito entre dos términos
//   · `|`  → OR  explícito entre dos términos
//   · "…"  → frase (con " « » “ ” ‘ ’). Se matchea con normalizarFrase.
//
// `parsearConsulta(q)` devuelve tokens: {type:'AND'|'OR'|'term', value, …}.
//   · Los términos se normalizan (minúsculas + sin acentos).
//   · Las frases llevan `isPhrase: true` y además `_needle` (precalculado
//     por `construirGrupos`).
//
// `construirGrupos(tokens, defaultLogic)` agrupa:
//   · grupos[] = []               → lista de ANDs, entre ellos OR
//   · pendingOp entre tokens      → fuerza AND u OR explícito
//   · defaultLogic 'AND'/'OR'     → lógica por defecto (checkbox).
//   · Añade `_needle` normalizado a los términos con isPhrase.
//
// `evaluarGrupos(groups, p, ambito)`:
//   · OR entre grupos, AND dentro de cada grupo.
//   · Usa los índices precalculados por ámbito:
//       enunciado · resolucion · ambas · todo
// ════════════════════════════════════════════════════════════════════════

const QUOTE_CHARS = /["\u00AB\u00BB\u201C\u201D\u2018\u2019]/;

function parsearConsulta(query) {
    const tokens = [];
    const s = String(query || '');
    let i = 0;
    while (i < s.length) {
        const c = s[i];
        if (/\s/.test(c)) { i++; continue; }
        if (c === '+') { tokens.push({ type: 'AND' }); i++; continue; }
        if (c === '|') { tokens.push({ type: 'OR' });  i++; continue; }

        if (QUOTE_CHARS.test(c)) {
            i++;
            let phrase = '';
            while (i < s.length && !QUOTE_CHARS.test(s[i])) phrase += s[i++];
            if (i < s.length) i++;
            const val = normalizarTexto(phrase.trim());
            if (val) tokens.push({ type: 'term', value: val, isPhrase: true });
            continue;
        }

        let word = '';
        while (i < s.length && !/[\s+|]/.test(s[i]) && !QUOTE_CHARS.test(s[i])) {
            word += s[i++];
        }
        if (word) {
            const val = normalizarTexto(word);
            if (val) tokens.push({ type: 'term', value: val, isPhrase: false });
        }
    }
    return tokens;
}

function construirGrupos(tokens, defaultLogic) {
    const groups = [[]];
    let pendingOp = null;

    for (const tok of tokens) {
        if (tok.type === 'AND' || tok.type === 'OR') {
            pendingOp = tok.type;
            continue;
        }
        if (tok.isPhrase) {
            tok._needle = normalizarFrase(tok.value);
        }
        const effectiveOp = pendingOp || defaultLogic;
        const lastGroup = groups[groups.length - 1];
        if (lastGroup.length === 0) {
            lastGroup.push(tok);
        } else if (effectiveOp === 'OR') {
            groups.push([tok]);
        } else {
            lastGroup.push(tok);
        }
        pendingOp = null;
    }
    return groups;
}


// ════════════════════════════════════════════════════════════════════════
// SECTOR 12 · COMPROBACIÓN DE PDFs (en diferido)
// ════════════════════════════════════════════════════════════════════════
// · `comprobarPdf(url)`:
//     – Si ya está en caché, devuelve la promesa guardada.
//     – En file:// asume que existe (no se puede HEAD).
//     – Intenta HEAD; si 405/501, prueba GET con Range: bytes=0-0.
//     – Cachea la promesa para no repetir la comprobación.
//
// · `getPdfObserver()`:
//     – Crea (una vez) un IntersectionObserver con rootMargin 200px.
//     – Cuando un botón .pdf-mini-buttons a[data-pdf-url] entra en el
//       viewport, deja de observarlo y lanza `comprobarPdf`.
//     – Si ok → clase .pdf-ok.
//     – Si no  → clase .pdf-missing, quita href/target, aria-disabled,
//       title "PDF no disponible", y según OCULTAR_PDF_FALTANTE lo
//       oculta o lo deja con texto "📄 no disponible".
//
// · `observarPdfsEn(nodos)`:
//     – Registra los PDFs de un lote recién añadido al DOM.
// ════════════════════════════════════════════════════════════════════════

async function comprobarPdf(url) {
    if (pdfExisteCache.has(url)) return pdfExisteCache.get(url);

    const promesa = (async () => {
        if (location.protocol === 'file:') return true;
        try {
            let r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
            if (r.ok) return true;
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
    if (!obs) return;
    nodos.forEach(n => {
        if (n.nodeType !== 1) return;
        n.querySelectorAll('.pdf-mini-buttons a[data-pdf-url]').forEach(a => obs.observe(a));
    });
}


// ════════════════════════════════════════════════════════════════════════
// SECTOR 13 · CARGA DE DATOS
// ════════════════════════════════════════════════════════════════════════
// Estrategia en 2 pasos:
//
//   1) JSON CONSOLIDADO `./Datos/problemas.json` — DESACTIVADO hoy.
//      Motivo: no incluía examenId por ejercicio → rompía el enlace
//      "Ver examen completo" (salía ?id=). Reactivar solo si se
//      regenera ese fichero con examenId en cada ejercicio.
//
//   2) FALLBACK: índice + N ficheros, con concurrencia limitada a 6.
//      · Lee `./Datos/indice.json` (array).
//      · Lanza 6 "workers" que van tomando exámenes del array por cursor
//        compartido, para no saturar red/host con cientos de fetches.
//      · Por cada examen:
//          – salta si `examenVacio(data)` (todos los meta vacíos y ningún
//            ejercicio con título/enunciado/tema/bloque).
//          – fusiona metadatos que falten en `data` desde el índice.
//      · Al final:
//          – filtra los null
//          – se queda con exámenes con id no vacío
//          – flatMap(normalizarEjercicio + enriquecerProblema)
//          – filter(!problemaVacio)
// ════════════════════════════════════════════════════════════════════════

async function cargarProblemasCrudos() {
    // 1) JSON consolidado — DESACTIVADO: no incluye examenId por ejercicio,
    //    lo que rompía los enlaces "Ver examen completo" (salían ?id=).
    //    Si en el futuro regeneras problemas.json con examenId en cada
    //    ejercicio, puedes reactivar este bloque.
    /*
    try {
        const r = await fetch('./Datos/problemas.json', { cache: 'no-cache' });
        if (r.ok) {
            const flat = await r.json();
            if (Array.isArray(flat) && flat.length) {
                return flat
                    .map(enriquecerProblema)
                    .filter(p => !problemaVacio(p));
            }
        }
    } catch { }
    */

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

                const vacio = v => v == null || String(v).trim() === '';
                const examenesVacios =
                    vacio(data.id) &&
                    vacio(data.codigo) &&
                    vacio(data.comunidad) &&
                    vacio(data.asignatura) &&
                    vacio(data.convocatoria) &&
                    vacio(data.nivel) &&
                    vacio(data.curso) &&
                    vacio(data.enunciado_general) &&
                    !(data.ejercicios || []).some(ej =>
                        !vacio(ej && ej.titulo) ||
                        !vacio(ej && ej.enunciado) ||
                        !vacio(ej && ej.Tema) ||
                        !vacio(ej && ej.Bloque)
                    );
                if (examenesVacios) {
                    resultados[i] = null;
                    continue;
                }

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
        .filter(examen => examen.id != null && String(examen.id).trim() !== '')
        .flatMap(examen =>
            (examen.ejercicios || []).map(ej => enriquecerProblema(normalizarEjercicio(ej, examen)))
        )
        .filter(p => !problemaVacio(p));
}


// ════════════════════════════════════════════════════════════════════════
// SECTOR 14 · ÍNDICES DE BÚSQUEDA POR ÁMBITO
// ════════════════════════════════════════════════════════════════════════
// Se calculan UNA vez tras cargar `todosLosProblemas` (precalcularIndiceBusqueda).
// Por cada problema se guarda `p._idx = {ambito: {all, phrase}}` con 4 ámbitos:
//   · enunciado  → titulo + enunciado + letras/enunciados de apartados
//   · resolucion → resultado + títulos/contenidos de la resolución
//   · ambas      → enunciado + resolucion
//   · todo       → ambas + meta (comunidad, asignatura, nivel, curso,
//                  temas[], bloques[])
// · `all`    = normalizarTexto (minúsculas, sin acentos) → para términos.
// · `phrase` = normalizarFrase (con espacios inicio/fin) → para frases.
// El select `#select-ambito` decide qué índice usa `getIndices`.
// ════════════════════════════════════════════════════════════════════════

function precalcularIndiceBusqueda() {
    todosLosProblemas.forEach(p => {
        const camposEnunciado = [p.titulo, p.enunciado];
        (p.apartados || []).forEach(ap => {
            if (ap.letra)     camposEnunciado.push(ap.letra);
            if (ap.enunciado) camposEnunciado.push(ap.enunciado);
        });

        const camposResolucion = [p.resultado];
        (p.resolucion || []).forEach(paso => {
            if (paso.titulo)    camposResolucion.push(paso.titulo);
            if (paso.contenido) camposResolucion.push(paso.contenido);
        });

        const camposMeta = [
            p.comunidad, p.asignatura, p.nivel, p.curso,
            ...(p.temas || []),
            ...(p.bloques || [])
        ];

        const txtEnunciado  = camposEnunciado.filter(Boolean).join(' ');
        const txtResolucion = camposResolucion.filter(Boolean).join(' ');
        const txtMeta       = camposMeta.filter(Boolean).join(' ');
        const txtAmbas      = [txtEnunciado, txtResolucion].filter(Boolean).join(' ');
        const txtTodo       = [txtEnunciado, txtResolucion, txtMeta].filter(Boolean).join(' ');

        p._idx = {
            enunciado:  { all: normalizarTexto(txtEnunciado),  phrase: normalizarFrase(txtEnunciado)  },
            resolucion: { all: normalizarTexto(txtResolucion), phrase: normalizarFrase(txtResolucion) },
            ambas:      { all: normalizarTexto(txtAmbas),      phrase: normalizarFrase(txtAmbas)      },
            todo:       { all: normalizarTexto(txtTodo),       phrase: normalizarFrase(txtTodo)       },
        };
    });
}

function getIndices(ambito, p) {
    if (p._idx && p._idx[ambito]) return p._idx[ambito];
    if (p._idx && p._idx.todo)    return p._idx.todo;
    return { all: '', phrase: ' ' };
}

function coincideTermino(tok, indices) {
    if (tok.isPhrase) {
        const needle = tok._needle;
        if (!needle || needle === ' ') return false;
        return (indices.phrase || ' ').includes(needle);
    }
    if (!tok.value) return false;
    return (indices.all || '').includes(tok.value);
}

function evaluarGrupos(groups, p, ambito) {
    const indices = getIndices(ambito, p);
    return groups.some(group => group.every(tok => coincideTermino(tok, indices)));
}


// ════════════════════════════════════════════════════════════════════════
// SECTOR 15 · CARGA GLOBAL Y ARRANQUE
// ════════════════════════════════════════════════════════════════════════
// `cargarDatos()` es el orquestador:
//   1. Pinta un "Cargando problemas..." en #resultados.
//   2. Llama a `cargarProblemasCrudos`, vuelve a filtrar por `problemaVacio`.
//   3. `precalcularIndiceBusqueda()` → `p._idx` en cada problema.
//   4. `inicializarFiltros()` → controles de años/conv/comunidad/bloque/tema.
//   5. `renderizarResultados()` → primer lote.
// Errores de carga → mensaje rojo en #resultados (no rompe la página).
// Se invoca desde `DOMContentLoaded` al final del script.
// ════════════════════════════════════════════════════════════════════════

async function cargarDatos() {
    const contenedor = $id('resultados');
    if (!contenedor) {
        console.error('No existe #resultados en el HTML.');
        return;
    }
    contenedor.innerHTML = '<p style="text-align:center; color:#64748b; padding: 20px;">Cargando problemas...</p>';

    try {
        todosLosProblemas = (await cargarProblemasCrudos())
            .filter(p => !problemaVacio(p));
        precalcularIndiceBusqueda();
        inicializarFiltros();
        renderizarResultados();
    } catch (error) {
        console.error('Error cargando los datos:', error);
        contenedor.innerHTML = `<p style="text-align:center; color:red;">Error al cargar: ${escapeHtml(error.message)}</p>`;
    }
}


// ════════════════════════════════════════════════════════════════════════
// SECTOR 16 · INICIALIZACIÓN DE FILTROS Y LISTENERS
// ════════════════════════════════════════════════════════════════════════
// Construye dinámicamente:
//   · #filtros-anio          → años descendentes (2026 → 2010…)
//   · #filtros-convocatoria  → orden alfabético
//   · #filtros-comunidad     → si el HTML no lo trae, lo crea y lo
//                              inserta tras #filtros-convocatoria.
//   · #filtros-bloque        → igual, se autoinyecta si falta.
//   · #filtros-tema          → vía renderFiltroTemas() (depende de bloques)
//
// Después engancha los listeners:
//   · select-orden            → re-render
//   · select-ambito           → re-render
//   · check-and-default       → re-render (lógica AND vs OR)
//   · check-mostrar-enunciado → toggle clase en #resultados
//   · btn-limpiar             → limpiarFiltros
//   · input-busqueda          → renderizarResultados con debounce 250 ms
// ════════════════════════════════════════════════════════════════════════

function inicializarFiltros() {
    const anios = [...new Set(todosLosProblemas.map(p => p.anio))]
        .filter(a => a != null)
        .sort((a, b) => b - a);
    const contenedorAnios = $id('filtros-anio');
    if (contenedorAnios) {
        contenedorAnios.innerHTML = '';
        anios.forEach(anio => {
            const btn = document.createElement('button');
            btn.className = 'btn-filtro';
            btn.textContent = anio;
            btn.onclick = () => toggleFiltro(anio, 'anio', btn);
            contenedorAnios.appendChild(btn);
        });
    }

    const convocatorias = [...new Set(todosLosProblemas.map(p => p.convocatoria))]
        .filter(c => c)
        .sort();
    const contenedorConvocatorias = $id('filtros-convocatoria');
    if (contenedorConvocatorias) {
        contenedorConvocatorias.innerHTML = '';
        convocatorias.forEach(conv => {
            const btn = document.createElement('button');
            btn.className = 'btn-filtro';
            btn.textContent = conv;
            btn.onclick = () => toggleFiltro(conv, 'convocatoria', btn);
            contenedorConvocatorias.appendChild(btn);
        });
    }

    const comunidades = [...new Set(
        todosLosProblemas.map(p => p.comunidad).filter(c => c)
    )].sort((a, b) => a.localeCompare(b));

    let contenedorComunidades = $id('filtros-comunidad');
    if (!contenedorComunidades && comunidades.length > 0) {
        contenedorComunidades = document.createElement('div');
        contenedorComunidades.id = 'filtros-comunidad';
        contenedorComunidades.className = 'botones';
        const ref = $id('filtros-convocatoria') || $id('filtros-tema');
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

    const bloquesMap = new Map();
    todosLosProblemas.forEach(p => (p.bloques || []).forEach(b => {
        if (!bloquesMap.has(b)) bloquesMap.set(b, b);
    }));
    const bloques = [...bloquesMap.keys()].sort((a, b) => a.localeCompare(b));

    let contenedorBloques = $id('filtros-bloque');
    if (!contenedorBloques && bloques.length > 0) {
        contenedorBloques = document.createElement('div');
        contenedorBloques.id = 'filtros-bloque';
        contenedorBloques.className = 'botones';
        const ref = $id('filtros-comunidad') || $id('filtros-tema');
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

    renderFiltroTemas();

    on('select-orden', 'change', renderizarResultados);
    on('select-ambito', 'change', renderizarResultados);
    on('check-and-default', 'change', renderizarResultados);
    on('check-mostrar-enunciado', 'change', (e) => {
        const cont = $id('resultados');
        if (cont) cont.classList.toggle('mostrar-enunciado', e.target.checked);
    });
    on('btn-limpiar', 'click', limpiarFiltros);
    on('input-busqueda', 'input', debounce(renderizarResultados, 250));
}


// ════════════════════════════════════════════════════════════════════════
// SECTOR 17 · TOGGLE DE UN FILTRO
// ════════════════════════════════════════════════════════════════════════
// Para tipo = 'anio' | 'convocatoria' | 'comunidad' | 'bloque' | 'tema':
//   · si el valor está activo → se quita del array y se desactiva el botón.
//   · si no                    → se añade y se activa el botón.
// Caso especial 'bloque':
//   · tras cambiar bloques, se recalcula la lista de temas disponibles
//     y se eliminan de `temasSeleccionados` los que ya no estén.
//   · se re-renderiza la lista de temas.
// Al final: `renderizarResultados()` + `actualizarBotonLimpiar()`.
// ════════════════════════════════════════════════════════════════════════

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


// ════════════════════════════════════════════════════════════════════════
// SECTOR 18 · RENDER PRINCIPAL (filtrado + orden + primer lote)
// ════════════════════════════════════════════════════════════════════════
// `renderizarResultados()`:
//   1. Lee los controles: orden, mostrar-enunciado, query, lógica (AND/OR),
//      ámbito.
//   2. Parsea la consulta → tokens → grupos.
//   3. Filtra `todosLosProblemas` aplicando:
//        · problemaVacio(p) === false
//        · año ∈ aniosSeleccionados (o sin filtro)
//        · convocatoria ∈ convocatoriasSeleccionadas (o sin filtro)
//        · comunidad ∈ comunidadesSeleccionadas (o sin filtro)
//        · tema ∈ temasSeleccionados (si hay)   → OR entre seleccionados
//        · bloque ∈ bloquesSeleccionados (si hay) → OR
//        · búsqueda (si hay) → evaluarGrupos(...)
//   4. Ordena:
//        · 'tema'  → tema asc, año desc, número asc
//        · resto   → número asc, año desc, tema asc
//   5. Guarda `filtradosActuales`, resetea `mostrados` y los "últimos
//      tema/bloque renderizados" (para que el primer h2 se inserte).
//   6. Vacía #resultados y, si hay resultados, crea el contenedor del
//      botón "Cargar más" y llama a `cargarMas()` para el primer lote.
// ════════════════════════════════════════════════════════════════════════

function renderizarResultados() {
    const contenedor = $id('resultados');
    if (!contenedor) return;

    const orden = valorDe('select-orden', 'num');
    const check = $id('check-mostrar-enunciado');
    const mostrarEnunciado = !!(check && check.checked);

    const queryRaw = valorDe('input-busqueda', '');
    const checkAnd = $id('check-and-default');
    const logica   = (checkAnd && checkAnd.checked) ? 'AND' : 'OR';
    const ambito   = valorDe('select-ambito', 'todo');
    const tokens   = parsearConsulta(queryRaw);
    const grupos   = construirGrupos(tokens, logica);
    const hayBusqueda = grupos.some(g => g.length > 0);

    let filtrados = todosLosProblemas.filter(p => {
        if (problemaVacio(p)) return false;

        const cumpleAnio = aniosSeleccionados.length === 0 || aniosSeleccionados.includes(p.anio);
        const cumpleConv = convocatoriasSeleccionadas.length === 0 || convocatoriasSeleccionadas.includes(p.convocatoria);
        const cumpleComunidad = comunidadesSeleccionadas.length === 0 || comunidadesSeleccionadas.includes(p.comunidad);

        const cumpleTema = temasSeleccionados.length === 0
            || temasSeleccionados.some(sel => (p.temas || []).includes(sel));
        const cumpleBloque = bloquesSeleccionados.length === 0
            || bloquesSeleccionados.some(sel => (p.bloques || []).includes(sel));

        let cumpleBusqueda = true;
        if (hayBusqueda) {
            cumpleBusqueda = evaluarGrupos(grupos, p, ambito);
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

    const contador = $id('contador-resultados');

    if (filtrados.length === 0) {
        contenedor.innerHTML = '<p style="text-align:center; color:#64748b; padding: 20px;">No hay problemas que coincidan con los filtros.</p>';
        if (contador) contador.textContent = '0 problemas encontrados';
        return;
    }

    const btnContainer = document.createElement('div');
    btnContainer.id = 'cargar-mas-container';
    btnContainer.className = 'cargar-mas-container';
    contenedor.appendChild(btnContainer);

    cargarMas();
}


// ════════════════════════════════════════════════════════════════════════
// SECTOR 19 · PAGINACIÓN ("Cargar más")
// ════════════════════════════════════════════════════════════════════════
// `cargarMas()`:
//   1. Calcula [desde, hasta) del siguiente lote sobre `filtradosActuales`.
//   2. `construirLote` genera los nodos (con h2 de grupo si aplica).
//   3. Los inserta ANTES del contenedor del botón.
//   4. Engancha el evento `toggle` de cada <details>:
//        – la primera vez que se abre, rellena el detalle en diferido
//          (`detalle.innerHTML = card._construirDetalle()`)
//        – marca data-loaded="1" para no repetir
//        – tipografía el detalle con MathJax.
//   5. Tipografía las tarjetas recién añadidas con MathJax.
//   6. Registra sus PDFs en el IntersectionObserver.
//   7. Actualiza el botón "Cargar más" y el contador.
// ════════════════════════════════════════════════════════════════════════

function cargarMas() {
    const desde = mostrados;
    const hasta = Math.min(mostrados + POR_PAGINA, filtradosActuales.length);
    if (desde >= hasta) return;
    mostrados = hasta;

    const nuevosNodos = construirLote(desde, hasta);
    const contenedor = $id('resultados');
    if (!contenedor) return;
    const btnContainer = $id('cargar-mas-container');

    nuevosNodos.forEach(n => {
        if (btnContainer) contenedor.insertBefore(n, btnContainer);
        else contenedor.appendChild(n);
    });

    const nuevasTarjetas = nuevosNodos.filter(n =>
        n.nodeType === 1 &&
        n.classList &&
        n.classList.contains('tarjeta-problema-desplegable')
    );

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

    if (nuevasTarjetas.length > 0) typesetMathJax(nuevasTarjetas);

    observarPdfsEn(nuevosNodos);

    actualizarBotonCargarMas();
    actualizarContador();
}


// ════════════════════════════════════════════════════════════════════════
// SECTOR 20 · CONSTRUCCIÓN DEL SUMMARY DE CADA TARJETA
// ════════════════════════════════════════════════════════════════════════
// Genera el HTML del `<summary>` de un `<details class="tarjeta-problema-…">`:
//   · Badges: bloques · temas · examen (año·conv·comunidad) · puntuación
//   · Cabecera: "Problema N: título" + botón "Ver examen completo ↗"
//   · Botones PDF: "./PDF/<codigo>.pdf" y "./PDF/<codigo>.CRI.pdf"
//   · Resumen del enunciado (150 caracteres máx.)
//
// Decisiones de seguridad / UX:
//   · Todo campo dinámico pasa por `escapeHtml`.
//   · `onclick="event.stopPropagation()"` en los enlaces y en el bloque
//     de PDFs para que NO se abra/cierre el `<details>` al pulsarlos.
//   · baseCode = código sin sufijo ".SOL" o, si no hay, `examenId`.
//   · Enlace "Ver examen completo" lleva `#p<numero>` para deep-link.
// ════════════════════════════════════════════════════════════════════════

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


// ════════════════════════════════════════════════════════════════════════
// SECTOR 21 · CONSTRUCCIÓN DEL DETALLE (lazy)
// ════════════════════════════════════════════════════════════════════════
// HTML del contenido desplegable:
//   · Enunciado completo (escapado)
//   · Apartados (letra + enunciado + puntuación opcional)
//   · Resolución paso a paso (.paso)
//   · Resultado final (.resultado-final)
// Se llama SOLO la primera vez que el usuario abre el <details>
// (ver SECTOR 19, listener 'toggle'). Se cachea con data-loaded="1".
// ════════════════════════════════════════════════════════════════════════

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


// ════════════════════════════════════════════════════════════════════════
// SECTOR 22 · CONSTRUCCIÓN DE UN LOTE DE TARJETAS
// ════════════════════════════════════════════════════════════════════════
// `construirLote(desde, hasta)`:
//   1. Recorre `filtradosActuales[desde..hasta)`.
//   2. Si `orden === 'tema'` y cambia el tema → inserta `<h2>` de grupo.
//   3. Si `orden === 'bloque'` y cambia el bloque → idem.
//   4. Añade un `<details>` por problema con summary + detalle vacío
//      (`data-loaded="0"`).
//   5. Convierte el HTML a nodos reales con un `<template>`.
//   6. A cada `<details>` le cuelga `_construirDetalle = () => …` para que
//      el listener del SECTOR 19 lo llame al abrirse (lazy).
//   7. Devuelve el array de nodos (incluye también los h2).
// ════════════════════════════════════════════════════════════════════════

function construirLote(desde, hasta) {
    const orden = valorDe('select-orden', 'num');
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


// ════════════════════════════════════════════════════════════════════════
// SECTOR 23 · ACTUALIZACIÓN DE BOTÓN "CARGAR MÁS" Y CONTADOR
// ════════════════════════════════════════════════════════════════════════
// · `actualizarBotonCargarMas()`
//     – Si no quedan problemas → vacía el contenedor del botón.
//     – Si quedan → repinta el botón con el número exacto de restantes.
// · `actualizarContador()`
//     – "N problemas encontrados" (singular/plural) y, si el lote no
//       cubre todo, añade "· mostrando M".
// ════════════════════════════════════════════════════════════════════════

function actualizarBotonCargarMas() {
    const btnContainer = $id('cargar-mas-container');
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
    const contador = $id('contador-resultados');
    if (!contador) return;
    const total = filtradosActuales.length;
    let texto = `${total} problema${total === 1 ? '' : 's'} encontrado${total === 1 ? '' : 's'}`;
    if (total > mostrados) texto += ` · mostrando ${mostrados}`;
    contador.textContent = texto;
}


// ════════════════════════════════════════════════════════════════════════
// SECTOR 24 · LIMPIAR FILTROS Y BOTÓN "LIMPIAR"
// ════════════════════════════════════════════════════════════════════════
// · `limpiarFiltros()`:
//     – vacía todos los arrays de filtros;
//     – desmarca "mostrar-enunciado" y "AND por defecto";
//     – vacía el input de búsqueda;
//     – resetea el select de ámbito a 'todo';
//     – quita la clase .activo de TODOS los .btn-filtro;
//     – re-renderiza temas, resultados y el botón "Limpiar".
//
// · `actualizarBotonLimpiar()`:
//     – muestra u oculta #btn-limpiar según si hay algún filtro o texto.
// ════════════════════════════════════════════════════════════════════════

function limpiarFiltros() {
    aniosSeleccionados = [];
    convocatoriasSeleccionadas = [];
    temasSeleccionados = [];
    comunidadesSeleccionadas = [];
    bloquesSeleccionados = [];

    const check = $id('check-mostrar-enunciado');
    if (check) check.checked = false;

    const checkAnd = $id('check-and-default');
    if (checkAnd) checkAnd.checked = false;

    const input = $id('input-busqueda');
    if (input) input.value = '';

    setValor('select-ambito', 'todo');

    document.querySelectorAll('.btn-filtro').forEach(btn => btn.classList.remove('activo'));
    renderFiltroTemas();
    renderizarResultados();
    actualizarBotonLimpiar();
}

function actualizarBotonLimpiar() {
    const btn = $id('btn-limpiar');
    if (!btn) return;
    const input = $id('input-busqueda');
    const hayFiltros = aniosSeleccionados.length > 0
        || convocatoriasSeleccionadas.length > 0
        || temasSeleccionados.length > 0
        || comunidadesSeleccionadas.length > 0
        || bloquesSeleccionados.length > 0
        || (input && input.value.trim() !== '');
    btn.style.display = hayFiltros ? 'block' : 'none';
}


// ════════════════════════════════════════════════════════════════════════
// SECTOR 25 · TIPOGRAFIADO CON MATHJAX
// ════════════════════════════════════════════════════════════════════════
// MathJax puede no haber cargado todavía (async). Se espera activamente
// hasta ~15 s (150 × 100 ms). Después:
//   · espera a `MathJax.startup.promise` si existe;
//   · llama a `typesetPromise(nodos)`;
//   · silencia errores con console.warn.
// Si `nodos` viene vacío, no hace nada.
// ════════════════════════════════════════════════════════════════════════

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


// ════════════════════════════════════════════════════════════════════════
// SECTOR 26 · ARRANQUE
// ════════════════════════════════════════════════════════════════════════
// Un único punto de entrada: en DOMContentLoaded, `cargarDatos()`.
// (No se expone nada en `window`: todo vive dentro del módulo salvo los
// handlers inline `onclick="cargarMas()"`, que por eso son globales.)
// ════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', cargarDatos);