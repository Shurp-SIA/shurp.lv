(() => {
  const openClassFor = (nav) => (nav.classList.contains('nav-bar') ? 'mobile-menu-open' : 'menu-open');

  function initMobileMenu() {
    const nav = document.querySelector('.nav-bar') || document.querySelector('.site-nav');
    if (!nav) return;
    const toggle =
      nav.querySelector('#homepage-menu-toggle') ||
      nav.querySelector('.site-menu-toggle') ||
      nav.querySelector('.mobile-menu-toggle');
    const menu =
      nav.querySelector('#homepage-nav-links') ||
      nav.querySelector('.homepage-links') ||
      nav.querySelector('.site-nav-links');
    if (!toggle || !menu) return;

    const openClass = openClassFor(nav);

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
      closeAllChoices();
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
  }

  function closeChoice(choice) {
    choice.classList.remove('is-open');
    const trigger = choice.querySelector('[data-nav-trigger]');
    const menu = choice.querySelector('[data-nav-menu]');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (menu) menu.hidden = true;
  }

  function closeAllChoices(except) {
    document.querySelectorAll('.nav-choice.is-open').forEach((choice) => {
      if (choice !== except) closeChoice(choice);
    });
  }

  function initNavChoices() {
    const choices = Array.from(document.querySelectorAll('.nav-choice'));
    if (!choices.length) return;

    choices.forEach((choice) => {
      const trigger = choice.querySelector('[data-nav-trigger]');
      const menu = choice.querySelector('[data-nav-menu]');
      if (!trigger || !menu) return;

      trigger.addEventListener('click', (event) => {
        event.stopPropagation();
        const willOpen = !choice.classList.contains('is-open');
        closeAllChoices(choice);
        // Close hamburger if open so menus don't stack.
        document.querySelectorAll('.nav-bar.mobile-menu-open, .site-nav.menu-open').forEach((nav) => {
          const toggle =
            nav.querySelector('#homepage-menu-toggle') ||
            nav.querySelector('.site-menu-toggle') ||
            nav.querySelector('.mobile-menu-toggle');
          if (!toggle) return;
          nav.classList.remove('mobile-menu-open', 'menu-open');
          toggle.setAttribute('aria-expanded', 'false');
          if (toggle.dataset.openLabel) toggle.setAttribute('aria-label', toggle.dataset.openLabel);
        });
        choice.classList.toggle('is-open', willOpen);
        trigger.setAttribute('aria-expanded', String(willOpen));
        menu.hidden = !willOpen;
        if (willOpen) {
          const first = menu.querySelector('a') || menu.querySelector('[aria-current="page"]');
          if (first) {
            if (!(first instanceof HTMLAnchorElement) && first.tabIndex < 0) first.tabIndex = -1;
            first.focus({ preventScroll: true });
          }
        }
      });

      choice.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && choice.classList.contains('is-open')) {
          event.preventDefault();
          closeChoice(choice);
          trigger.focus({ preventScroll: true });
        }
      });
    });

    document.addEventListener('click', (event) => {
      if (!event.target.closest('.nav-choice')) closeAllChoices();
    });

    window.matchMedia('(min-width: 768px)').addEventListener('change', (event) => {
      if (event.matches) closeAllChoices();
    });
  }

  initNavChoices();
  initMobileMenu();
})();
