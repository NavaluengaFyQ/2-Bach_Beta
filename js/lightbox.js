/* ============================================================
   VISOR AMPLIADO (LIGHTBOX) COMPARTIDO
   ESTE EFECTO LO QUE HACE ES ABRIR LA IMAGEN A PANTALLA COMPLETA SIN NAVEGAR.
   ------------------------------------------------------------
   Enlázalo en cada HTML de "Unidades" con:
       <script src="../js/lightbox.js" defer></script>
   Se activa en cualquier <a class="lightbox-link"> que
   envuelva una <img>. Al pulsar: abre la imagen a pantalla
   completa sin navegar. Al volver a pulsar (o Escape, o el
   botón ×, o el fondo): cierra y restaura el scroll exacto.
   Si JS está desactivado, el href abre la imagen en pestaña
   nueva como respaldo.
   ============================================================ */
(function () {
    'use strict';

    var overlay, overlayImg, overlayCaption, closeBtn, lastFocused;
    var savedY = 0;
    var built = false;

    function build() {
        overlay = document.createElement('div');
        overlay.className = 'lightbox-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Imagen ampliada');
        overlay.tabIndex = -1;

        overlayImg = document.createElement('img');
        overlayImg.alt = '';
        overlayImg.decoding = 'async';

        overlayCaption = document.createElement('p');
        overlayCaption.className = 'lightbox-caption';

        closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'lightbox-close';
        closeBtn.setAttribute('aria-label', 'Cerrar imagen ampliada');
        closeBtn.innerHTML = '&times;';

        overlay.appendChild(overlayImg);
        overlay.appendChild(overlayCaption);
        overlay.appendChild(closeBtn);
        document.body.appendChild(overlay);

        // Cualquier clic/tap dentro del visor (imagen incluida) cierra.
        overlay.addEventListener('click', close);

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && overlay.classList.contains('is-open')) {
                close();
            }
        });

        built = true;
    }

    function lockScroll() {
        savedY = window.pageYOffset || document.documentElement.scrollTop || 0;
        document.body.classList.add('lightbox-lock');
        document.body.style.position = 'fixed';
        document.body.style.top = '-' + savedY + 'px';
        document.body.style.left = '0';
        document.body.style.right = '0';
        document.body.style.width = '100%';
    }

    function unlockScroll() {
        document.body.classList.remove('lightbox-lock');
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        window.scrollTo(0, savedY);
    }

    function open(link) {
        var img = link.querySelector('img');
        var fig = link.closest ? link.closest('.photo-figure') : null;
        var cap = fig ? fig.querySelector('.figure-caption') : null;

        overlayImg.src = link.getAttribute('href');
        overlayImg.alt = img ? (img.alt || '') : '';
        overlayCaption.textContent = cap
            ? cap.textContent.replace(/\s+/g, ' ').trim()
            : '';
        overlayCaption.style.display = overlayCaption.textContent ? '' : 'none';

        lastFocused = link;
        lockScroll();
        overlay.classList.add('is-open');
        // Fuerza un repintado para que se vea la transición de opacidad.
        void overlay.offsetWidth;
        overlay.focus();
    }

    function close() {
        if (!overlay || !overlay.classList.contains('is-open')) return;
        overlay.classList.remove('is-open');
        unlockScroll();
        if (lastFocused && lastFocused.focus) {
            lastFocused.focus({ preventScroll: true });
        }
        setTimeout(function () { overlayImg.removeAttribute('src'); }, 200);
    }

    function init() {
        if (!built) build();
        var links = document.querySelectorAll('a.lightbox-link');
        Array.prototype.forEach.call(links, function (link) {
            if (link.dataset.lightboxBound === '1') return;
            link.dataset.lightboxBound = '1';
            link.addEventListener('click', function (e) {
                // Evita la pestaña nueva; el href queda como respaldo sin JS.
                e.preventDefault();
                open(link);
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expuesto por si en algún momento se añaden imágenes dinámicamente.
    window.__lightboxInit = init;
})();