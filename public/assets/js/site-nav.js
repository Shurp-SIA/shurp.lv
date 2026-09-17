(() => {
  const nav = document.querySelector('.nav-bar') || document.querySelector('.site-nav');
  if (!nav) return;
  const toggle = nav.querySelector('#homepage-menu-toggle') || nav.querySelector('.site-menu-toggle') || nav.querySelector('.mobile-menu-toggle');
  const menu = nav.querySelector('#homepage-nav-links') || nav.querySelector('.homepage-links') || nav.querySelector('.site-nav-links');
  if (!toggle || !menu) return;

  const openClass = nav.classList.contains('nav-bar') ? 'mobile-menu-open' : 'menu-open';

  function setOpen(open, restoreFocus = false) {
    nav.classList.toggle(openClass, open);
    toggle.setAttribute('aria-expanded', String(open));
    if (toggle.dataset.openLabel && toggle.dataset.closeLabel) {
      toggle.setAttribute('aria-label', open ? toggle.dataset.closeLabel : toggle.dataset.openLabel);
    }
    if (restoreFocus) toggle.focus({ preventScroll: true });
  }

  nav.classList.add('nav-ready');
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    setOpen(open);
    if (open) {
      const first = menu.querySelector('a');
      if (first) first.focus({ preventScroll: true });
    }
  });
  nav.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains(openClass)) {
      event.preventDefault();
      setOpen(false, true);
    }
  });
  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('click', (event) => {
    if (!nav.contains(event.target)) setOpen(false);
  });
  nav.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!nav.contains(document.activeElement)) setOpen(false);
    }, 0);
  });
  window.matchMedia('(min-width: 768px)').addEventListener('change', (event) => {
    if (event.matches) setOpen(false);
  });
})();
