// ════════════════════════════════════════════════════════════════════════
// SECTOR 0 · IDENTIFICACIÓN DEL SCRIPT
// ════════════════════════════════════════════════════════════════════════
// Archivo   : scripts/unir-problemas.js
// Ubicación : raíz/scripts/
// Tipo      : Script Node.js (CLI, sin dependencias externas)
// Entrada   : raíz/Datos/indice.json   +   raíz/Datos/<id>.json  (uno por examen)
// Salida    : raíz/Datos/problemas.json  (array plano de ejercicios)
// Versión   : con diagnóstico
//
// Ejecución normal:
//   $ node scripts/unir-problemas.js
//
// Sinónimo de "aplanar / merge": recorre el índice de exámenes, abre cada
// JSON individual, fusiona los metadatos del examen con cada ejercicio y
// vuelca todo en un único array plano `problemas.json`. Ese fichero es el
// que consume el buscador (`problemas-inline_v04-Filtro_prefijado.html`).
// ════════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════════
// SECTOR 1 · QUÉ HACE
// ════════════════════════════════════════════════════════════════════════
//   1. Localiza `Datos/` e `Datos/indice.json` (con diagnóstico si fallan).
//   2. Parsea el índice (array de { id, … }).
//   3. Para cada examen:
//        · abre `Datos/<id>.json`
//        · descarta exámenes vacíos / ilegibles / ausentes
//        · aplana cada ejercicio: { ...meta, ...ejercicio }
//        · normaliza los alias `tema→Tema` y `bloque→Bloque`
//        · descarta ejercicios vacíos
//   4. Escribe `Datos/problemas.json` (array plano, indentado 2 espacios).
//   5. Imprime un resumen con contadores (procesados / omitidos).
// ════════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════════
// SECTOR 2 · POR QUÉ EXISTE
// ════════════════════════════════════════════════════════════════════════
// · Los JSON por examen son cómodos de editar a mano, pero incómodos de
//   filtrar en cliente (habría que abrir N ficheros desde el navegador).
// · Este script produce UN único `problemas.json` con todos los ejercicios
//   y sus metadatos ya fusionados → el buscador hace un solo fetch.
// · Se ejecuta offline, cuando cambia el contenido de `Datos/`.
//   NO se ejecuta en el navegador.
// ════════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════════
// SECTOR 3 · DEPENDENCIAS
// ════════════════════════════════════════════════════════════════════════
//   · Solo módulos nativos de Node: `fs` y `path`.
//   · No requiere `npm install`. Basta con `node unir-problemas.js`.
//   · Necesita Node ≥ 12 (por Object spread en `{ ...meta, ...ej }`).
// ════════════════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');


// ════════════════════════════════════════════════════════════════════════
// SECTOR 4 · RUTAS DE ENTRADA / SALIDA
// ════════════════════════════════════════════════════════════════════════
// DIR    → raíz/Datos/            (una carpeta por encima de scripts/)
// SALIDA → raíz/Datos/problemas.json
// El script NO escribe fuera de `Datos/`.
// ════════════════════════════════════════════════════════════════════════

const DIR    = path.join(__dirname, '..', 'Datos');
const SALIDA = path.join(DIR, 'problemas.json');


// ════════════════════════════════════════════════════════════════════════
// SECTOR 5 · DIAGNÓSTICO DE ARRANQUE
// ════════════════════════════════════════════════════════════════════════
// Antes de hacer nada, imprime por consola:
//   · versión de Node, __dirname, rutas absolutas
//   · si existen `Datos/` y `Datos/indice.json`
// Esto permite depurar el clásico "no me encuentra el fichero" cuando
// el script se mueve de carpeta o se ejecuta desde otro `cwd`.
// ════════════════════════════════════════════════════════════════════════

console.log('=== INICIO ===');
console.log('node:', process.version);
console.log('__dirname:', __dirname);
console.log('DIR (Datos):', DIR);
console.log('SALIDA:', SALIDA);
console.log('¿Existe DIR?', fs.existsSync(DIR));

const rutaIndice = path.join(DIR, 'indice.json');
console.log('¿Existe indice.json?', fs.existsSync(rutaIndice));


// ════════════════════════════════════════════════════════════════════════
// SECTOR 6 · VALIDACIONES DE ENTORNO (abortan con código ≠ 0)
// ════════════════════════════════════════════════════════════════════════
// Si falta la carpeta o el índice, no hay nada que hacer:
//   · salir con process.exit(1) → CI / npm scripts detectan el fallo
//   · mostrar el contenido de DIR cuando falta indice.json (ayuda a
//     descubrir erratas tipo `indice.JSON`, `indice.json.txt`, etc.)
// ════════════════════════════════════════════════════════════════════════

if (!fs.existsSync(DIR)) {
    console.error('✖ No existe la carpeta Datos. Ajusta DIR en el script.');
    process.exit(1);
}
if (!fs.existsSync(rutaIndice)) {
    console.error('✖ No existe indice.json en', DIR);
    console.error('   Contenido de DIR:', fs.readdirSync(DIR));
    process.exit(1);
}


// ════════════════════════════════════════════════════════════════════════
// SECTOR 7 · LECTURA Y PARSEO DEL ÍNDICE
// ════════════════════════════════════════════════════════════════════════
// `indice.json` debe ser un ARRAY de exámenes: [ { id, … }, … ]
// Si no es JSON válido o no es array, se aborta con mensaje claro.
// Se imprime el tamaño y los primeros 80 caracteres para detectar:
//   · ficheros vacíos
//   · BOM / caracteres raros al inicio
//   · JSON truncado
// ════════════════════════════════════════════════════════════════════════

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


// ════════════════════════════════════════════════════════════════════════
// SECTOR 8 · HELPERS DE VACUIDAD
// ════════════════════════════════════════════════════════════════════════
// `vacio(v)`   → null/undefined/'' → true.  (0 y false cuentan como valor)
// `problemaVacio(p)` → true si el ejercicio no tiene NADA útil:
//                       ni título, ni enunciado, ni resultado, ni tema,
//                       ni bloque, ni apartados, ni resolución.
// `examenVacio(d)`   → true si TODA la metainformación está vacía Y
//                       ningún ejercicio aporta título/enunciado/tema/bloque.
//
// Estos filtros evitan contaminar `problemas.json` con "cascarones"
// (exámenes a medio rellenar, ejercicios plantilla sin contenido).
// ════════════════════════════════════════════════════════════════════════

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
// SECTOR 9 · BUCLE PRINCIPAL (aplanado examen → ejercicio)
// ════════════════════════════════════════════════════════════════════════
// Recorre `indice` y, para cada examen:
//   1. Salta si no tiene `id` o si el JSON no existe / no parsea.
//   2. Salta si `examenVacio(data)` es true.
//   3. Construye `meta` con los campos comunes a todos los ejercicios
//      (con fallback a lo que venga en el índice).
//   4. Para cada ejercicio del examen:
//        · fusiona `{ ...meta, ...ej }`  → campos del ejercicio
//          SOBREESCRIBEN los del examen si colisionan
//        · normaliza alias: `tema → Tema`, `bloque → Bloque`
//        · salta si `problemaVacio(plano)`
//        · push en `planos`
//
// Contadores de diagnóstico: procesados / omitidosExamen / omitidosEjercicio.
// Progreso cada 20 exámenes para no inundar la consola.
// ════════════════════════════════════════════════════════════════════════

const planos = [];
let omitidosExamen = 0;
let omitidosEjercicio = 0;
let procesados = 0;

for (const ex of indice) {
    procesados++;
    if (procesados % 20 === 0) console.log(`… procesados ${procesados}/${indice.length}`);

    // 1. Examen sin id → no podemos localizar su JSON → omitir
    if (!ex || vacio(ex.id)) { omitidosExamen++; continue; }

    // 2. Resolver ruta del JSON individual
    const ruta = path.join(DIR, `${ex.id}.json`);
    if (!fs.existsSync(ruta)) {
        console.warn(`⚠ Falta ${ruta}`);
        omitidosExamen++;
        continue;
    }

    // 3. Leer y parsear; un JSON corrupto no debe tumbar el proceso entero
    let data;
    try {
        data = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    } catch (e) {
        console.warn(`⚠ Error leyendo ${ruta}: ${e.message}`);
        omitidosExamen++;
        continue;
    }

    // 4. Descartar exámenes sin contenido real
    if (examenVacio(data)) {
        console.warn(`⚠ Examen vacío: ${ex.id} → omitido`);
        omitidosExamen++;
        continue;
    }

    // 5. Metadatos que se replicarán en cada ejercicio del examen.
    //    Orden de preferencia: data del JSON > data del índice > valor por defecto.
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

    // 6. Aplanar cada ejercicio
    for (const ej of (data.ejercicios || [])) {
        if (!ej) { omitidosEjercicio++; continue; }

        const plano = { ...meta, ...ej };

        // 6a. Normalizar alias (tolerancia con JSON antiguos)
        if (!plano.Tema   && plano.tema)   plano.Tema   = plano.tema;
        if (!plano.Bloque && plano.bloque) plano.Bloque = plano.bloque;

        // 6b. Descartar ejercicios sin contenido útil
        if (problemaVacio(plano)) {
            console.warn(`⚠ Ejercicio vacío en ${ex.id} #${plano.numero} → omitido`);
            omitidosEjercicio++;
            continue;
        }

        planos.push(plano);
    }
}


// ════════════════════════════════════════════════════════════════════════
// SECTOR 10 · ESCRITURA DE SALIDA
// ════════════════════════════════════════════════════════════════════════
// `problemas.json` = array plano con TODOS los ejercicios.
// Indentación 2 espacios: legible a mano, diff-friendly en git.
// Si `planos` está vacío se escribe `[]` igualmente (no se borra la
// salida anterior antes de escribir → escritura atómica a nivel de fs).
// ════════════════════════════════════════════════════════════════════════

console.log('Escribiendo', planos.length, 'problemas en', SALIDA, '…');
fs.writeFileSync(SALIDA, JSON.stringify(planos, null, 2), 'utf8');


// ════════════════════════════════════════════════════════════════════════
// SECTOR 11 · RESUMEN FINAL
// ════════════════════════════════════════════════════════════════════════
// Se imprimen cuatro cifras de control:
//   · problemas generados   (longitud de `planos`)
//   · exámenes procesados   (longitud de `indice`)
//   · exámenes omitidos     (ausentes / corruptos / vacíos)
//   · ejercicios omitidos   (vacíos dentro de exámenes válidos)
// ════════════════════════════════════════════════════════════════════════

console.log('');
console.log(`✔ Generados ${planos.length} problemas en ${SALIDA}`);
console.log(`  · exámenes procesados: ${indice.length}`);
console.log(`  · exámenes omitidos:   ${omitidosExamen}`);
console.log(`  · ejercicios omitidos: ${omitidosEjercicio}`);