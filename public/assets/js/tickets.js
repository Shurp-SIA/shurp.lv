(() => {
  "use strict";
  const lv = document.body.dataset.lang === "lv";
  const basePath = document.body.dataset.basePath || "";
  const t = lv ? {
    title:"Biļetes", loading:"Pārbaudām biļeti un cenu…", exact:"Atveram precīzi izvēlēto reisu BezRindas vietnē.", search:"Precīzu reisu nevarējām apstiprināt. Meklē maršrutu BezRindas vietnē.", unavailable:"Biļete šim reisam pašlaik nav pieejama. Meklē pie biļešu tirgotāja.", invalid:"Trūkst brauciena informācijas. Meklē biļeti pie biļešu tirgotāja.", button:"Meklēt biļetes BezRindas", fare:"Pieaugušā biļete ar komisiju", checked:"Pārbaudīts", note:"BezRindas vietnē vēl izvēlēsies biļetes veidu un pasažieru skaitu."
  } : {
    title:"Tickets", loading:"Checking the ticket and fare…", exact:"Opening the exact departure on BezRindas.", search:"We could not confirm the exact departure. Search the route on BezRindas.", unavailable:"Tickets for this departure are currently unavailable. Search with the ticket seller.", invalid:"Journey details are missing. Search with the ticket seller.", button:"Find tickets on BezRindas", fare:"Adult ticket including commission", checked:"Checked", note:"You will still choose the ticket type and passenger count on BezRindas."
  };
  const fallback = "https://www.bezrindas.lv/lv/autobusu-biletes", trainFallback = "https://www.bezrindas.lv/lv/vilcienu-biletes";
  const status = document.querySelector("#ticket-status"), action = document.querySelector("#ticket-action"), price = document.querySelector("#ticket-price");
  document.title = `${t.title} — Shurp`;
  function sellerUrl(raw) {
    try {
      const url = new URL(raw), hosts = new Set(["www.bezrindas.lv", "1188.bezrindas.lv"]);
      if (url.protocol !== "https:" || !hosts.has(url.hostname) || url.username || url.password || url.port || url.hash) return null;
      const entries = [...url.searchParams.entries()], names = entries.map(([name]) => name), allowed = new Set(["departure_id", "destination_id", "departure_date", "departure_race_id", "quantity"]);
      if (["/lv/train/prepare_ltc", "/lv/bus/prepare_ltc"].includes(url.pathname)) {
        if (names.length !== new Set(names).size || names.some(name => !allowed.has(name))) return null;
        const train = url.pathname === "/lv/train/prepare_ltc", station = train ? /^\d+V$/ : /^\d+$/;
        if (!station.test(url.searchParams.get("departure_id") || "") || !station.test(url.searchParams.get("destination_id") || "") || !/^\d+$/.test(url.searchParams.get("departure_race_id") || "") || !/^\d{4}-\d\d-\d\d$/.test(url.searchParams.get("departure_date") || "") || (url.searchParams.has("quantity") && url.searchParams.get("quantity") !== "1")) return null;
        return {url:url.href, exact:true};
      }
      if (["/lv/autobusu-biletes", "/lv/vilcienu-biletes"].includes(url.pathname) && !entries.length) return {url:url.href, exact:false};
      if (url.pathname.match(/^\/lv\/bus\/choose\/\d+\/\d+\/1\/\d{8}\/0$/) && !entries.length) return {url:url.href, exact:false};
      return null;
    } catch (_) { return null; }
  }
  function valid(params) {
    const id = value => /^[A-Za-z0-9:_-]{1,200}$/.test(value || "");
    return id(params.get("trip_id")) && id(params.get("from_stop_id")) && id(params.get("to_stop_id")) && /^\d{4}-\d\d-\d\d$/.test(params.get("service_date") || "");
  }
  function fallbackFor(params) { return params?.get("trip_id")?.startsWith("vivi:") ? trainFallback : fallback; }
  function minor(value) { if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value; if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value))) return Number(value); return null; }
  function amount(quote) {
    const fare = minor(quote?.fare_minor), fee = minor(quote?.fee_minor), total = minor(quote?.total_minor);
    if (fare === null || fee === null || total === null || fare + fee !== total || quote.currency !== "EUR") return "";
    try { return new Intl.NumberFormat(lv ? "lv-LV" : "en-GB", {style:"currency", currency:"EUR"}).format(total / 100); } catch (_) { return ""; }
  }
  function quoteText(quote) {
    const total = amount(quote), checked = new Date(quote?.checked_at || "");
    if (!total) return "";
    return `${t.fare}: ${total}${Number.isNaN(+checked) ? "" : ` · ${t.checked}: ${new Intl.DateTimeFormat(lv ? "lv-LV" : "en-GB", {dateStyle:"short", timeStyle:"short", hourCycle:"h23", timeZone:"Europe/Riga"}).format(checked)}`}`;
  }
  function fallbackState(message, raw, quote, generic = fallback) {
    status.textContent = message;
    const url = sellerUrl(raw)?.url || generic;
    action.href = url; action.hidden = false; action.removeAttribute("target"); action.rel = "noreferrer";
    const text = quoteText(quote); price.hidden = !text; if (text) price.textContent = text;
  }
  async function start() {
    const params = new URLSearchParams(location.search);
    if (!valid(params)) { fallbackState(t.invalid); return; }
    try {
      const response = await fetch(`${basePath}/api/transport/tickets?${params}`, {headers:{Accept:"application/json"}});
      const result = response.ok ? await response.json() : null;
      const destination = sellerUrl(result?.url);
      if (result?.match === "exact" && destination?.exact) {
        status.textContent = t.exact;
        const text = quoteText(result.price); price.hidden = !text; if (text) price.textContent = text;
        window.location.replace(destination.url);
        return;
      }
      fallbackState(result?.match === "search" ? t.search : t.unavailable, destination?.url, result?.price, fallbackFor(params));
    } catch (_) { fallbackState(t.unavailable, null, null, fallbackFor(params)); }
  }
  status.textContent = t.loading;
  start();
})();
