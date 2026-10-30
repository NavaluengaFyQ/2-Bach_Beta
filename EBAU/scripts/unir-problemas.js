// scripts/unir-problemas.js
const fs   = require('fs');
const path = require('path');

console.log('=== INICIO ===');
console.log('node:', process.version);
console.log('__dirname:', __dirname);

const DIR    = path.join(__dirname, '..', 'Datos');
const SALIDA = path.join(DIR, 'problemas.json');

console.log('DIR:', DIR);
console.log('¿Existe DIR?', fs.existsSync(DIR));

const vacio = v => v == null || String(v).trim() === '';

function problemaVacio(p) {
    if (!p) return true;
    const t = s => !vacio(s);
    return !(t(p.titulo) || t(p.enunciado) || t(p.resultado) ||
             t(p.Tema || p.tema) || t(p.Bloque || p.bloque) ||
             (Array.isArray(p.apartados)  && p.apartados.some(a  => a && (t(a.enunciado) || t(a.letra)))) ||
             (Array.isArray(p.resolucion) && p.resolucion.some(r => r && (t(r.contenido) || t(r.titulo)))));
}

function examenVacio(d) {
    if (!d) return true;
    const metaVacio =
        vacio(d.id) && vacio(d.codigo) && vacio(d.comunidad) &&
        vacio(d.asignatura) && vacio(d.convocatoria) && vacio(d.nivel) &&
        vacio(d.curso) && vacio(d.enunciado_general);
    const algunEj = (d.ejercicios || []).some(ej => ej && (
        !vacio(ej.titulo) || !vacio(ej.enunciado) ||
        !vacio(ej.Tema)   || !vacio(ej.Bloque)));
    return metaVacio && !algunEj;
}

const rutaIndice = path.join(DIR, 'indice.json');
console.log('¿Existe indice.json?', fs.existsSync(rutaIndice));
if (!fs.existsSync(rutaIndice)) {
    console.error('✖ No existe', rutaIndice);
    process.exit(1);
}

const indice = JSON.parse(fs.readFileSync(rutaIndice, 'utf8'));
console.log('Exámenes en índice:', indice.length);

const planos = [];
let omitEx = 0, omitEj = 0;

for (const ex of indice) {
    if (!ex || vacio(ex.id)) { omitEx++; continue; }
    const ruta = path.join(DIR, ex.id + '.json');
    if (!fs.existsSync(ruta)) { console.warn('⚠ Falta', ruta); omitEx++; continue; }
    let data;
    try { data = JSON.parse(fs.readFileSync(ruta, 'utf8')); }
    catch (e) { console.warn('⚠ Error', ruta, e.message); omitEx++; continue; }
    if (examenVacio(data)) { console.warn('⚠ Examen vacío:', ex.id); omitEx++; continue; }

    const meta = {
        id: ex.id,
        codigo: data.codigo || ex.codigo || '',
        comunidad: data.comunidad || ex.comunidad || '',
        anio: data.anio != null ? data.anio : (ex.anio != null ? ex.anio : null),
        convocatoria: data.convocatoria || ex.convocatoria || '',
        asignatura: data.asignatura || '',
        nivel: data.nivel || '',
        curso: data.curso || '',
        enunciado_general: data.enunciado_general || ''
    };

    for (const ej of (data.ejercicios || [])) {
        if (!ej) { omitEj++; continue; }
        const plano = Object.assign({}, meta, ej);
        if (!plano.Tema   && plano.tema)   plano.Tema   = plano.tema;
        if (!plano.Bloque && plano.bloque) plano.Bloque = plano.bloque;
        if (problemaVacio(plano)) { omitEj++; continue; }
        planos.push(plano);
    }
}

fs.writeFileSync(SALIDA, JSON.stringify(planos, null, 2), 'utf8');
console.log('');
console.log('✔ Generados', planos.length, 'problemas en', SALIDA);
console.log('  exámenes omitidos:', omitEx, '· ejercicios omitidos:', omitEj);