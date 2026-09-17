(() => {
  const nav = document.querySelector('.site-nav');
  if (!nav) return;
  const toggle = nav.querySelector('.site-menu-toggle');
  const menu = nav.querySelector('.site-nav-links');
  const compact = matchMedia('(max-width: 1279px)');
  function setOpen(open, restoreFocus = false) {
    nav.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? toggle.dataset.closeLabel : toggle.dataset.openLabel);
    if (restoreFocus) toggle.focus({preventScroll: true});
  }
  nav.classList.add('nav-ready');
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    setOpen(open);
    if (open) menu.querySelector('a').focus({preventScroll: true});
  });
  nav.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.classList.contains('menu-open')) {
      event.preventDefault();
      setOpen(false, true);
    }
  });
  menu.addEventListener('click', event => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('click', event => {
    if (!nav.contains(event.target)) setOpen(false);
  });
  nav.addEventListener('focusout', () => {
    // Let the browser finish moving focus before deciding it left the menu.
    setTimeout(() => {
      if (!nav.contains(document.activeElement)) setOpen(false);
    }, 0);
  });
  compact.addEventListener('change', () => {
    const focusedLink = menu.contains(document.activeElement);
    setOpen(false, compact.matches && focusedLink);
  });
})();
