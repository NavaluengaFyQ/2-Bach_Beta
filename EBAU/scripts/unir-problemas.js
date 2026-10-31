// scripts/unir-problemas.js  (versión con diagnóstico)
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
        if (problemaVacio(plano)) {
            console.warn(`⚠ Ejercicio vacío en ${ex.id} #${plano.numero} → omitido`);
            omitidosEjercicio++;
            continue;
        }
        planos.push(plano);
    }
}

console.log('Escribiendo', planos.length, 'problemas en', SALIDA, '…');
fs.writeFileSync(SALIDA, JSON.stringify(planos, null, 2), 'utf8');

console.log('');
console.log(`✔ Generados ${planos.length} problemas en ${SALIDA}`);
console.log(`  · exámenes procesados: ${indice.length}`);
console.log(`  · exámenes omitidos:   ${omitidosExamen}`);
console.log(`  · ejercicios omitidos: ${omitidosEjercicio}`);