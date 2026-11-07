// ════════════════════════════════════════════════════════════════════════
// SECTOR 0 · IDENTIFICACIÓN DEL SCRIPT
// ════════════════════════════════════════════════════════════════════════
// Archivo   : scripts/unir-problemas.js
// Ubicación : raíz/scripts/
// Tipo      : Script Node.js (CLI, sin dependencias externas)
// Entrada   : raíz/Datos/indice.json   +   raíz/Datos/<id>.json
// Salida    : raíz/Datos/problemas.json  (array plano de ejercicios)
//
// NOVEDAD v05: cada problema recibe `problemaId` único y estable:
//     <codigo>-<numero>   (o <examenId>-<numero> si no hay código)
//   Si hay colisión, se sufija con -a, -b, ...
// ════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════
// SECTOR 0 · IDENTIFICACIÓN DEL SCRIPT
// ════════════════════════════════════════════════════════════════════════
// Archivo   : scripts/unir-problemas.js
// Ubicación : raíz/scripts/
// Tipo      : Script Node.js (CLI, sin dependencias externas)
// Entrada   : raíz/Datos/indice.json   +   raíz/Datos/<id>.json
// Salida    : raíz/Datos/problemas.json  (array plano de ejercicios)
//
// NOVEDAD v06: cada problema recibe `problemaId`, un entero PURO
// (solo dígitos) generado con hash FNV-1a 32 bits de "codigo|numero".
//   · Determinista: mismo input → mismo ID en cada ejecución.
//   · Único: colisiones (rarísimas) resueltas con salt → nuevo hash.
//   · Estable: añadir exámenes no reasigna IDs existentes.
// ════════════════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');

const DIR    = path.join(__dirname, '..', 'Datos');
const SALIDA = path.join(DIR, 'problemas.json');

console.log('=== INICIO ===');
console.log('node:', process.version);
console.log('__dirname:', __dirname);
console.log('DIR (Datos):', DIR);
console.log('SALIDA:', SALIDA);
console.log('¿Existe DIR?', fs.existsSync(DIR));

const rutaIndice = path.join(DIR, 'indice.json');
console.log('¿Existe indice.json?', fs.existsSync(rutaIndice));

if (!fs.existsSync(DIR)) {
    console.error('✖ No existe la carpeta Datos. Ajusta DIR en el script.');
    process.exit(1);
}
if (!fs.existsSync(rutaIndice)) {
    console.error('✖ No existe indice.json en', DIR);
    console.error('   Contenido de DIR:', fs.readdirSync(DIR));
    process.exit(1);
}

const indiceTxt = fs.readFileSync(rutaIndice, 'utf8');
console.log('Tamaño indice.json:', indiceTxt.length, 'bytes');
console.log('Primeros 80 caracteres:', indiceTxt.slice(0, 80).replace(/\n/g, '⏎'));

let indice;
try {
    indice = JSON.parse(indiceTxt);
} catch (e) {
    console.error('✖ indice.json no es JSON válido:', e.message);
    process.exit(1);
}
console.log('¿indice es array?', Array.isArray(indice), '· longitud:', indice.length);

if (!Array.isArray(indice)) {
    console.error('✖ indice.json no es un array. Estructura recibida:', typeof indice);
    process.exit(1);
}

const vacio = v => v == null || String(v).trim() === '';

function problemaVacio(p) {
    if (!p) return true;
    const t = s => !vacio(s);
    return !(t(p.titulo) || t(p.enunciado) || t(p.resultado) ||
             t(p.Tema || p.tema) || t(p.Bloque || p.bloque) ||
             (Array.isArray(p.apartados)  && p.apartados.some(a  => a  && (t(a.enunciado) || t(a.letra)))) ||
             (Array.isArray(p.resolucion) && p.resolucion.some(r => r && (t(r.contenido) || t(r.titulo)))));
}

function examenVacio(d) {
    if (!d) return true;
    const todoMetaVacio =
        vacio(d.id) && vacio(d.codigo) && vacio(d.comunidad) &&
        vacio(d.asignatura) && vacio(d.convocatoria) && vacio(d.nivel) &&
        vacio(d.curso) && vacio(d.enunciado_general);
    const algunEjercicioUtil = (d.ejercicios || []).some(ej => ej && (
        !vacio(ej.titulo) || !vacio(ej.enunciado) ||
        !vacio(ej.Tema)   || !vacio(ej.Bloque)));
    return todoMetaVacio && !algunEjercicioUtil;
}

// ════════════════════════════════════════════════════════════════════════
// ID NUMÉRICO ÚNICO Y ESTABLE
// ════════════════════════════════════════════════════════════════════════
// FNV-1a 32 bits → entero entre 1 y 4294967295.
// El resultado se devuelve como STRING para conservar exactitud y evitar
// cualquier posible problema de precisión / formato.
// ════════════════════════════════════════════════════════════════════════

function hashNumerico(str) {
    let h = 2166136261;                       // offset basis FNV-1a
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);           // FNV prime
    }
    h = h >>> 0;                              // unsigned 32-bit
    return h === 0 ? 1 : h;                   // evitar 0
}

function generarIdProblema(plano, salt = '') {
    const codigo = plano.codigo || plano.id || 'problema';
    const num    = plano.numero != null ? plano.numero : '';
    const clave  = `${codigo}|${num}|${salt}`;
    return String(hashNumerico(clave));
}

// ════════════════════════════════════════════════════════════════════════
// BUCLE PRINCIPAL
// ════════════════════════════════════════════════════════════════════════

const planos = [];
let omitidosExamen = 0;
let omitidosEjercicio = 0;
let procesados = 0;

for (const ex of indice) {
    procesados++;
    if (procesados % 20 === 0) console.log(`… procesados ${procesados}/${indice.length}`);

    if (!ex || vacio(ex.id)) { omitidosExamen++; continue; }

    const ruta = path.join(DIR, `${ex.id}.json`);
    if (!fs.existsSync(ruta)) {
        console.warn(`⚠ Falta ${ruta}`);
        omitidosExamen++;
        continue;
    }

    let data;
    try {
        data = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    } catch (e) {
        console.warn(`⚠ Error leyendo ${ruta}: ${e.message}`);
        omitidosExamen++;
        continue;
    }

    if (examenVacio(data)) {
        console.warn(`⚠ Examen vacío: ${ex.id} → omitido`);
        omitidosExamen++;
        continue;
    }

    const meta = {
        id:               ex.id,
        codigo:           data.codigo           || ex.codigo           || '',
        comunidad:        data.comunidad        || ex.comunidad        || '',
        anio:             data.anio != null ? data.anio
                          : (ex.anio != null ? ex.anio : null),
        convocatoria:     data.convocatoria     || ex.convocatoria     || '',
        asignatura:       data.asignatura       || '',
        nivel:            data.nivel            || '',
        curso:            data.curso            || '',
        enunciado_general: data.enunciado_general || ''
    };

    for (const ej of (data.ejercicios || [])) {
        if (!ej) { omitidosEjercicio++; continue; }

        const plano = { ...meta, ...ej };

        if (!plano.Tema   && plano.tema)   plano.Tema   = plano.tema;
        if (!plano.Bloque && plano.bloque) plano.Bloque = plano.bloque;

        plano.problemaId = generarIdProblema(plano);   // ← base hash

        if (problemaVacio(plano)) {
            console.warn(`⚠ Ejercicio vacío en ${ex.id} #${plano.numero} → omitido`);
            omitidosEjercicio++;
            continue;
        }

        planos.push(plano);
    }
}

// ════════════════════════════════════════════════════════════════════════
// RESOLUCIÓN DE COLISIONES DE ID (mismo orden que el navegador)
// ════════════════════════════════════════════════════════════════════════

const usados = new Set();
const colisiones = [];
for (const p of planos) {
    let id = p.problemaId;
    let salt = 0;
    while (usados.has(id)) {
        salt++;
        id = generarIdProblema(p, '#' + salt);
    }
    usados.add(id);
    if (id !== p.problemaId) {
        colisiones.push({ original: p.problemaId, nuevo: id, codigo: p.codigo, numero: p.numero });
        p.problemaId = id;
    }
}
if (colisiones.length > 0) {
    console.warn(`⚠ ${colisiones.length} colisión(es) de ID resueltas:`);
    colisiones.forEach(c => console.warn(`   ${c.original} → ${c.nuevo}  (${c.codigo} #${c.numero})`));
}

// ════════════════════════════════════════════════════════════════════════
// ESCRITURA
// ════════════════════════════════════════════════════════════════════════

console.log('Escribiendo', planos.length, 'problemas en', SALIDA, '…');
fs.writeFileSync(SALIDA, JSON.stringify(planos, null, 2), 'utf8');

console.log('');
console.log(`✔ Generados ${planos.length} problemas en ${SALIDA}`);
console.log(`  · exámenes procesados: ${indice.length}`);
console.log(`  · exámenes omitidos:   ${omitidosExamen}`);
console.log(`  · ejercicios omitidos: ${omitidosEjercicio}`);
console.log(`  · IDs únicos asignados: ${usados.size}`);