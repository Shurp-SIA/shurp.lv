/* First-party, consent-first website events. Deliberately no URL/referrer collection. */
(() => {
  "use strict";
  window.ShurpAnalytics = { track() {} };
  const match = location.pathname.match(/^\/(lv|en)(?:\/(index(?:\.html)?|tutorial(?:\.html)?|help(?:\.html)?|privacy(?:\.html)?|terms(?:\.html)?)?)?\/?$/);
  const isGet = /^\/get(?:\.html)?\/?$/.test(location.pathname);
  if (!match && !isGet) return; // Auth callbacks and unknown routes never initialize.
  if (navigator.globalPrivacyControl === true || [navigator.doNotTrack, window.doNotTrack, navigator.msDoNotTrack].some(v => v === "1" || v === "yes")) return;
  const locale = match ? match[1] : (document.documentElement.lang === "en" ? "en" : "lv");
  const page = isGet ? "get" : (!match[2] || match[2].startsWith("index") ? "home" : match[2].replace(/\.html$/, ""));
  const key = "shurp-analytics-consent-v1";
  let consent = null, enabled = false, session = null, seq = 0, queue = [], timer = null, panel = null, settings = null, viewed = false;
  try { consent = localStorage.getItem(key); } catch (_) { /* A choice still works for this document. */ }
  const values = {
    platform: ["ios", "android", "other"], placement: ["header", "hero", "footer", "result", "body"],
    target: ["home", "download", "help", "privacy", "terms", "tutorial", "language", "faq", "safety", "features", "external_service"]
  };
  const events = {
    page_view: [], store_click: ["platform", "placement"], navigation_click: ["target", "placement"], app_redirect: ["platform"]
  };
  function newSession() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  function flush() {
    clearTimeout(timer); timer = null;
    if (!enabled || consent !== "granted" || !queue.length) return;
    const body = JSON.stringify({session, events: queue.splice(0, 20)});
    try { fetch("/api/analytics/events", {method: "POST", headers: {"Content-Type": "application/json"}, body, credentials: "omit", referrerPolicy: "no-referrer", keepalive: true}).catch(() => {}); } catch (_) {}
  }
  function track(event, props = {}) {
    if (consent !== "granted" || !Object.hasOwn(events, event) || !props || typeof props !== "object" || Array.isArray(props)) return;
    const keys = events[event];
    if (Object.keys(props).length !== keys.length || keys.some(k => !values[k].includes(props[k]))) return;
    if (event === "app_redirect" && !isGet) return;
    if (event !== "page_view" && !isGet && !viewed) pageView();
    if (queue.length >= 20 || seq >= 10000) return;
    try { session ||= newSession(); } catch (_) { return; }
    const safe = {page, locale};
    keys.forEach(k => { safe[k] = props[k]; });
    queue.push({event, seq: ++seq, props: safe});
    if (enabled && !timer) timer = setTimeout(flush, 150);
  }
  window.ShurpAnalytics = {track};
  function pageView() { if (!viewed && !isGet && consent === "granted") { viewed = true; track("page_view"); } }
  function choose(value) {
    consent = value;
    try { localStorage.setItem(key, value); } catch (_) {}
    if (value !== "granted") { queue = []; session = null; seq = 0; viewed = false; clearTimeout(timer); timer = null; }
    panel.hidden = true; settings.hidden = false; settings.focus();
    pageView();
  }
  function ui() {
    if (isGet || !document.body || settings) return;
    const lv = locale === "lv";
    settings = document.createElement("button"); settings.type = "button"; settings.className = "analytics-settings";
    settings.textContent = lv ? "Analītikas iestatījumi" : "Analytics settings";
    panel = document.createElement("section"); panel.className = "analytics-consent"; panel.setAttribute("aria-label", settings.textContent);
    const text = document.createElement("p");
    text.textContent = lv ? "Vai atļaut vietnes lietojuma analītiku? Tā palīdz saprast, kur apmeklētāji apstājas. Saglabājam tikai apmeklējumu un klikšķu kategorijas līdz 90 dienām. Izvēli vari mainīt jebkurā laikā." : "Allow website usage analytics? It helps us understand where visitors stop. We keep only visit and click categories for up to 90 days. You can change your choice at any time.";
    panel.append(text);
    const privacy = document.createElement("a"); privacy.href = `/${locale}/privacy`; privacy.textContent = lv ? "Privātuma politika" : "Privacy policy"; panel.append(privacy);
    const actions = document.createElement("div"); actions.className = "analytics-actions";
    for (const [choice, label] of [["granted", lv ? "Atļaut" : "Allow"], ["denied", lv ? "Neatļaut" : "Decline"]]) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.onclick = () => choose(choice); actions.append(button);
    }
    panel.append(actions); document.body.append(settings, panel);
    panel.hidden = consent === "granted" || consent === "denied"; settings.hidden = !panel.hidden;
    settings.onclick = () => { panel.hidden = false; settings.hidden = true; actions.querySelector("button").focus(); };
  }
  function placement(link) {
    if (link.closest("#result-list")) return "result";
    if (link.closest("header,nav")) return "header";
    if (link.closest("footer")) return "footer";
    if (link.closest("#download,.hero")) return "hero";
    return "body";
  }
  document.addEventListener("click", event => {
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!link || link.closest(".analytics-consent")) return;
    let url;
    try { url = new URL(link.href, location.origin); } catch (_) { return; }
    const where = placement(link);
    if (url.hostname === "apps.apple.com") track("store_click", {platform: "ios", placement: where});
    else if (url.hostname === "play.google.com") track("store_click", {platform: "android", placement: where});
    else if (url.origin === location.origin) {
      let target = null;
      if (url.hash === "#how-it-works") target = "features";
      else if (url.hash === "#faq-safety") target = "safety";
      else if (["#download", "#faq", "#safety", "#features"].includes(url.hash)) target = url.hash.slice(1);
      else if (/^\/get(?:\.html)?\/?$/.test(url.pathname)) target = "download";
      else if (!url.hash) {
        const route = url.pathname.match(/^\/(lv|en)(?:\/(index(?:\.html)?|tutorial(?:\.html)?|help(?:\.html)?|privacy(?:\.html)?|terms(?:\.html)?)?)?\/?$/);
        if (route) target = route[1] !== locale ? "language" : (!route[2] || route[2].startsWith("index") ? "home" : route[2].replace(/\.html$/, ""));
      }
      if (target) track("navigation_click", {target, placement: where});
    } else track("navigation_click", {target: "external_service", placement: where});
    flush();
  });
  addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  addEventListener("storage", event => {
    if (event.key === key && event.newValue !== "granted") {
      consent = "denied"; queue = []; session = null; seq = 0; viewed = false; clearTimeout(timer); timer = null;
    }
  });
  fetch("/api/analytics/config", {credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store"})
    .then(response => response.ok ? response.json() : null)
    .then(config => {
      if (!config || config.enabled !== true) { queue = []; return; }
      enabled = true;
      const start = () => { ui(); pageView(); flush(); };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, {once: true}); else start();
    }).catch(() => { queue = []; });
})();
