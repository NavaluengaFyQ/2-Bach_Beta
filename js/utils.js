/* ══════════════════════════════════════════════════════════════════
   CONSTRUCTOR DE URLs DE FILTRO
   Toma los data-* de cada <a class="filtro-pau"> (o <button>) y
   construye la query string con URLSearchParams. Usa el href del
   propio enlace como base, así respeta rutas relativas.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const CAMPOS = ['q','comunidad','bloque','tema',
                  'anio','convocatoria','ambito','modo','orden'];

  document.querySelectorAll('a.filtro-pau, button.filtro-pau').forEach(el => {
    const p = new URLSearchParams();
    CAMPOS.forEach(k => {
      const v = el.dataset[k];
      if (v != null && v !== '') p.set(k, v);
    });

    // Base = href original del enlace (puede ser "../EBAU/..." o "EBAU/...")
    const base = el.getAttribute('href') || 'EBAU/problemas-inline_v04.html';
    const qs   = p.toString();
    const url  = qs ? (base + '?' + qs) : base;

    if (el.tagName === 'A') {
      el.href = url;                                // conserva Ctrl+clic, clic medio, etc.
    } else {
      el.addEventListener('click', () => { location.href = url; });
    }
  });
})();