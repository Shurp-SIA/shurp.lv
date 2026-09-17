(() => {
  "use strict";
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!isIOS) return;

  let cancelPending = () => {};
  document.addEventListener("click", event => {
    const link = event.target instanceof Element ? event.target.closest("a.carpool-cta") : null;
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const fallback = new URL(link.href, location.href);
    if (fallback.origin !== new URL(document.body.dataset.websiteBase).origin || fallback.pathname !== "/get") return;
    event.preventDefault();
    cancelPending();

    let timer;
    const cancel = () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", cancel);
      document.removeEventListener("pointerdown", cancel);
      document.removeEventListener("keydown", cancel);
      cancelPending = () => {};
    };
    const onVisibility = () => { if (document.hidden) cancel(); };
    const openStore = () => {
      const visible = !document.hidden;
      cancel();
      // Keep the results in history. /get replaces only its own store-handoff
      // entry, so Back returns to the route rather than replaying a redirect.
      if (visible) location.assign(fallback.href);
    };
    cancelPending = cancel;
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", cancel);
    document.addEventListener("pointerdown", cancel);
    document.addEventListener("keydown", cancel);
    timer = setTimeout(openStore, 1500);
    try {
      // Registered by the released iOS app; /home is a real, auth-guarded route.
      // Android currently registers only auth/KYC callbacks, not this URI.
      location.assign("lv.shurp.app:///home");
    } catch (_) { openStore(); }
  });
})();
