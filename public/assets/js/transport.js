(() => {
  "use strict";
  const lv = document.body.dataset.lang === "lv";
  const basePath = document.body.dataset.basePath || "";
  const t = lv ? {
    pick:"Izvēlies vietu no saraksta.", same:"Sākumpunktam un galamērķim jāatšķiras.", loading:"Meklē maršrutus…", none:"Šajā laikā maršruti nav atrasti.", transit:"Sabiedriskais transports", carpool:"Kopbraukšana", check:"Pieejamību pārbaudi Shurp", free:"Bez maksas", unknown:"Cena lietotnē", seat:"brīvas vietas", seat1:"1 brīva vieta", arrival:"Aptuvenā ierašanās", local:"Vietējie galapunkti", nearby:"Tuvumā", city:"Šajā vietā", unavailable:"Shurp dati pašlaik nav pieejami.", pending:"Shurp dati vēl tiek sagatavoti.", stale:"Shurp dati var būt novecojuši.", reserve:"Rezervēt vietu", failed:"Transporta dati pašlaik nav pieejami.", placeCity:"Pilsēta", placeLocality:"Apdzīvota vieta", placeStop:"Pietura", walk:"Aptuvena iešana", wait:"Gaidīšana", transfers:"pārsēšanās", direct:"Bez pārsēšanās", ride:"Brauciens"
  } : {
    pick:"Choose a place from the list.", same:"Origin and destination must be different.", loading:"Finding journeys…", none:"No journeys found at this time.", transit:"Public transport", carpool:"Carpooling", check:"Check availability in Shurp", free:"Free", unknown:"Price in app", seat:"seats available", seat1:"1 seat available", arrival:"Estimated arrival", local:"Local endpoints", nearby:"Nearby", city:"In this locality", unavailable:"Shurp data is currently unavailable.", pending:"Shurp data is being prepared.", stale:"Shurp data may be out of date.", reserve:"Reserve a seat", failed:"Transport data is currently unavailable.", placeCity:"City", placeLocality:"Locality", placeStop:"Stop", walk:"Estimated walk", wait:"Waiting", transfers:"transfers", direct:"No transfers", ride:"Ride"
  };
  Object.assign(t, lv ? {
    showDetails: "Rādīt detaļas", hideDetails: "Paslēpt detaļas", fare: "Cenu pārbaudi pie biļešu tirgotāja", fareUnknown: "Cena nav pieejama", fareLoading: "Pārbauda cenu…", ticketPrice: "Pieaugušā biļete ar komisiju", tickets: "Cena un biļetes", ticketExact: "Turpināt pie BezRindas", ticketSearch: "Meklēt biļetes BezRindas", ticketUnavailable: "Biļetes nav pieejamas", checked: "Pārbaudīts", separate: "Katram brauciena posmam var būt vajadzīga atsevišķa biļete. Maršrutu un cenu apstiprini tirgotāja vietnē.", updated: "Atjaunināts", justNow: "tikko", scheduled: "Plānotie laiki; kavējumi nav iekļauti.", invalid: "Pārbaudi brauciena datumu un laiku."
  } : {
    showDetails: "Show details", hideDetails: "Hide details", fare: "Check fare with the ticket seller", fareUnknown: "Fare unavailable", fareLoading: "Checking fare…", ticketPrice: "Adult ticket including commission", tickets: "Fare and tickets", ticketExact: "Continue to BezRindas", ticketSearch: "Find tickets on BezRindas", ticketUnavailable: "Tickets unavailable", checked: "Checked", separate: "Each ride may need a separate ticket. Confirm your route and fare on the seller’s website.", updated: "Updated", justNow: "just now", scheduled: "Scheduled times; delays are not included.", invalid: "Check the journey date and time."
  });
  Object.assign(t, lv ? {
    baseFare: "Pamata cena", baseFareUnknown: "Pamata cena nav pieejama", sellerFareUnknown: "Tirgotāja cena nav pieejama", baseFareNote: "Standarta pieaugušā biļete vienā virzienā. Pakalpojumu piemaksas un tirgotāja komisija nav iekļautas; atlaides var mainīt gala cenu."
  } : {
    baseFare: "Base fare", baseFareUnknown: "Base fare unavailable", sellerFareUnknown: "Seller fare unavailable", baseFareNote: "Standard adult one-way fare. Service supplements and seller fees are excluded; discounts may change the final price."
  });
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const selected = { from:null, to:null };
  $(".footer .wrap").insertAdjacentHTML("beforeend", `<span class="source-credit">${lv ? "Vietu nosaukumi atvasināti no koordinātēm, izmantojot" : "Locality labels are derived from coordinates using"} <a href="https://www.vzd.gov.lv/lv/VAR-atversana">VZD/VARIS</a> ${lv ? "datus" : "data"} (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>).</span>`);
  const modes = [...document.querySelectorAll('input[name="mode"]')];
  try { const savedMode = localStorage.getItem("shurp-transport-mode"); const saved = modes.find(el => el.value === savedMode); if (saved) saved.checked = true; } catch (_) { /* Storage can be unavailable in private browsing. */ }
  const rememberMode = value => { try { localStorage.setItem("shurp-transport-mode", value); } catch (_) {} };
  const clearShortcut = () => document.querySelectorAll(".route-shortcut").forEach(el => el.setAttribute("aria-pressed", "false"));
  modes.forEach(el => el.onchange = () => { rememberMode(el.value); clearShortcut(); });

  async function api(path, signal) { const r = await fetch(`${basePath}/api/transport/${path}`, {headers:{Accept:"application/json"}, signal}); if (!r.ok) throw Error("transport"); return r.json(); }
  function placeKind(place) { return place.kind === "city" ? t.placeCity : place.kind === "locality" ? t.placeLocality : t.placeStop; }
  function autocomplete(key) {
    const input = $(`#${key}`), list = $(`#${key}-list`); let timer, controller, items = [], active = -1, version = 0;
    input.setAttribute("role", "combobox"); input.setAttribute("aria-autocomplete", "list"); input.setAttribute("aria-controls", list.id); input.setAttribute("aria-expanded", "false");
    list.setAttribute("role", "listbox"); list.setAttribute("aria-label", lv ? "Vietas" : "Places");
    const close = () => { list.hidden = true; active = -1; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); };
    const select = index => { const place = items[index]; if (!place) return; selected[key] = place; input.value = place.name; close(); };
    const render = () => { list.innerHTML = items.map((place,index) => `<li role="presentation"><button id="${key}-option-${index}" role="option" tabindex="-1" type="button" data-index="${index}" aria-selected="${index === active}"><b>${esc(place.name)}</b><small>${esc(place.municipality_name || placeKind(place))}</small></button></li>`).join(""); list.hidden = !items.length; input.setAttribute("aria-expanded", String(!!items.length)); if (active >= 0) input.setAttribute("aria-activedescendant", `${key}-option-${active}`); else input.removeAttribute("aria-activedescendant"); };
    input.oninput = () => { clearShortcut(); selected[key] = null; clearTimeout(timer); controller?.abort(); const thisVersion = ++version;
      if (input.value.trim().length < 2) { items = []; close(); return; }
      timer = setTimeout(async () => { controller = new AbortController(); try { const data = await api(`places?q=${encodeURIComponent(input.value.trim())}&limit=8`, controller.signal); if (thisVersion !== version) return; items = Array.isArray(data.places) ? data.places : []; active = -1; render(); } catch (error) { if (error.name !== "AbortError" && thisVersion === version) close(); } }, 250);
    };
    input.onkeydown = event => { if (event.key === "Escape") { close(); return; } if (list.hidden || !items.length) return; if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); active = (active + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; render(); } else if (event.key === "Enter" && active >= 0) { event.preventDefault(); select(active); } };
    list.onmousedown = event => event.preventDefault();
    list.onclick = event => { const button = event.target.closest("button"); if (button) select(Number(button.dataset.index)); };
    input.onblur = () => setTimeout(() => { if (!list.matches(":focus-within")) close(); }, 180);
    return (place, value = "") => { clearTimeout(timer); controller?.abort(); version++; items = []; selected[key] = place; input.value = place?.name || value; close(); };
  }
  const setFrom = autocomplete("from"), setTo = autocomplete("to");
  $("#swap-route").onclick = () => {
    const from = selected.from, to = selected.to, fromText = $("#from").value, toText = $("#to").value;
    setFrom(to, toText); setTo(from, fromText); clearShortcut();
    if (selected.from && selected.to) $("#planner").requestSubmit();
  };
  document.querySelectorAll(".route-shortcut").forEach(button => button.onclick = () => {
    setFrom({ id: "city:riga", name: "Rīga", kind: "city" });
    setTo({ id: `city:${button.dataset.city}`, name: button.dataset.name, kind: "city" });
    modes.find(el => el.value === "all").checked = true; rememberMode("all");
    clearShortcut(); button.setAttribute("aria-pressed", "true");
    $("#planner").requestSubmit();
  });

  function clock(value) { if (!value) return "—"; const text = String(value); if (/^\d\d:\d\d/.test(text)) return text.slice(0,5); const parsed = new Date(text); return Number.isNaN(+parsed) ? text.slice(0,5) : new Intl.DateTimeFormat(lv?"lv-LV":"en-GB",{hour:"2-digit",minute:"2-digit",hourCycle:"h23",timeZone:"Europe/Riga"}).format(parsed); }
  function duration(value) { const m = Number(value); if (!Number.isFinite(m)) return ""; const h = Math.floor(m / 60); return h ? `${h} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`; }
  function distance(value) { const metres = Number(value); return !Number.isFinite(metres) ? "" : metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toLocaleString(lv?"lv-LV":"en-GB",{maximumFractionDigits:1})} km`; }
  function stopRows(leg) { const stops = Array.isArray(leg.stops) && leg.stops.length ? leg.stops : [leg.from_stop && {name:leg.from_stop.name || leg.from_stop,departure:leg.departure},leg.to_stop && {name:leg.to_stop.name || leg.to_stop,arrival:leg.arrival}].filter(Boolean); return `<ol>${stops.map(s => `<li><time>${esc(clock(s.departure || s.arrival))}</time><span>${esc(s.name || "—")}</span></li>`).join("")}</ol>`; }
  const modeLabels = lv ? {bus:"Autobuss", train:"Vilciens", tram:"Tramvajs", trolleybus:"Trolejbuss"} : {bus:"Bus", train:"Train", tram:"Tram", trolleybus:"Trolleybus"};
  function modeTag(mode) {
    const rail = mode === "train" || mode === "tram";
    const drawing = rail ? '<rect x="5" y="3" width="14" height="15" rx="4"/><path d="M5 10h14M9 3v7M8 18l-2 3m10-3 2 3"/><path d="M8 14h1m6 0h1"/>' : '<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M4 12h16M12 5v7M7 19v2m10-2v2M7 16h1m8 0h1"/>';
    const label = modeLabels[mode] || t.transit;
    return `<span class="mode-badge"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${drawing}</svg>${label}</span>`;
  }
  function journeyModes(legs) {
    const modes = [...new Set(legs.filter(leg => leg.kind !== "walk").map(leg => leg.mode))];
    return `<span class="mode-list">${(modes.length ? modes : [null]).map(modeTag).join("")}</span>`;
  }
  function ticketProvider(leg) {
    if (leg.source_id === "vivi" && leg.mode === "train") return {name: "BezRindas", generic: "https://www.bezrindas.lv/lv/vilcienu-biletes"};
    if (leg.source_id === "atd" && leg.mode === "bus") return {name: "BezRindas", generic: "https://www.bezrindas.lv/lv/autobusu-biletes"};
    return null;
  }
  function ticketQuery(leg) {
    const id = value => typeof value === "string" && /^[A-Za-z0-9:_-]{1,200}$/.test(value) ? value : "";
    const trip = id(leg.trip_id), from = id(leg.from_stop?.id), to = id(leg.to_stop?.id);
    const serviceDate = typeof leg.service_date === "string" && /^\d{4}-\d\d-\d\d$/.test(leg.service_date) ? leg.service_date : rigaDate(leg.departure);
    if (!trip || !from || !to || !/^\d{4}-\d\d-\d\d$/.test(serviceDate)) return "";
    return new URLSearchParams({trip_id:trip, from_stop_id:from, to_stop_id:to, service_date:serviceDate}).toString();
  }
  function baseFare(leg) {
    const fare = leg.base_fare;
    if (!fare || !Number.isSafeInteger(fare.amount_minor) || fare.amount_minor <= 0 || fare.currency !== "EUR" || !["atd", "vivi"].includes(fare.source_id) || fare.source_id !== leg.source_id || fare.kind !== "standard_adult_one_way") return `<span class="base-fare unavailable">${t.baseFareUnknown}</span>`;
    const amount = new Intl.NumberFormat(lv ? "lv-LV" : "en-GB", {style:"currency", currency:"EUR"}).format(fare.amount_minor / 100);
    return `<span class="base-fare" data-base-fare>${t.baseFare}: ${esc(amount)} <small>· ${fare.source_id === "atd" ? "ATD" : "Vivi"}</small></span>`;
  }
  function ticketLink(leg, ticketKey, number) {
    const provider = ticketProvider(leg); if (!provider) return "";
    const query = ticketQuery(leg);
    const tag = query ? "button" : "a", attributes = query ? 'type="button" data-ticket-reveal' : `href="${esc(provider.generic)}" data-ticket-cta rel="noreferrer"`;
    const from = leg.from_stop?.name || leg.stops?.[0]?.name || "—", to = leg.to_stop?.name || leg.stops?.at(-1)?.name || "—";
    return `<span class="ticket-item" data-ticket-key="${esc(ticketKey)}" data-ticket-generic="${esc(provider.generic)}"${query ? ` data-ticket-query="${esc(query)}"` : ""}>${baseFare(leg)}<${tag} class="ticket-link" data-placement="result" ${attributes}><span data-ticket-label><span data-ticket-action>${t.tickets}</span> <span data-ticket-identity>${number} · ${esc(clock(leg.departure))} ${esc(from)} → ${esc(to)}</span></span> <span data-ticket-icon aria-hidden="true">${query ? "⌄" : "→"}</span></${tag}><span class="ticket-price" data-ticket-price>${t.fare}</span><small data-ticket-checked></small></span>`;
  }
  function rideLeg(leg, number, ticketKey) { const route = leg.route_short_name || leg.route_name || leg.mode || "—", ticket = ticketLink(leg,ticketKey,number) || `<span class="ticket-price">${t.fareUnknown}</span>`; return `<section class="leg"><div class="leg-head"><span class="leg-count">${number}</span><strong>${esc(route)}</strong>${modeTag(leg.mode)}<span class="journey-summary">${esc(clock(leg.departure))}–${esc(clock(leg.arrival))}</span></div>${stopRows(leg)}${ticket}</section>`; }
  function walkLeg(leg) { const from = leg.from_stop?.name || leg.from_stop || "—", to = leg.to_stop?.name || leg.to_stop || "—"; return `<section class="walk"><strong>${t.walk}</strong> · ${esc(distance(leg.distance_m))} · ${esc(duration(leg.duration_minutes))}<br><span>${esc(from)} → ${esc(to)}</span></section>`; }
  function transfer(leg) { const wait = Number(leg.transfer_wait_minutes); return Number.isFinite(wait) && wait > 0 ? `<p class="transfer">${t.wait}: ${esc(duration(wait))}</p>` : ""; }
  function transit(journey, journeyIndex) {
    const legs = Array.isArray(journey.legs) && journey.legs.length ? journey.legs : [{...journey,kind:"ride"}], from = journey.from_stop?.name || journey.from_stop || selected.from?.name || "—", to = journey.to_stop?.name || journey.to_stop || selected.to?.name || "—";
    let number = 0; const rideTickets = []; const details = legs.map((leg,index) => { const before = index && leg.kind !== "walk" ? transfer(leg) : ""; if (leg.kind === "walk") return walkLeg(leg); number += 1; const ticketKey = `${journeyIndex}-${number}`; rideTickets.push({leg,ticketKey}); return `${before}${rideLeg(leg,number,ticketKey)}`; }).join("");
    const transfers = Number.isFinite(Number(journey.transfer_count)) ? Number(journey.transfer_count) : Math.max(0, number - 1), summary = transfers ? `${transfers} ${t.transfers}` : t.direct;
    const ticketBar = `<div class="ticket-bar"><div class="ticket-links">${rideTickets.map(({leg,ticketKey}, index) => ticketLink(leg,ticketKey,index + 1) || `<span class="ticket-item"><span class="ticket-price">${t.fareUnknown}</span></span>`).join("")}</div><p class="base-fare-note">${t.baseFareNote}</p></div>`;
    return `<article class="card"><button type="button" class="transit-main" aria-expanded="false" aria-controls="journey-details-${journeyIndex}">${journeyModes(legs)}<div class="line"><span class="time"><strong>${esc(clock(journey.departure))}</strong><small>${esc(from)}</small></span><i class="track" aria-hidden="true"></i><span class="time end"><strong>${esc(clock(journey.arrival))}</strong><small>${esc(to)}</small></span><span class="meta"><span class="ride-duration">${esc(duration(journey.duration_minutes))}</span> · ${esc(summary)}</span></div><span class="details-toggle"><span data-details-label>${t.showDetails}</span><svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4"/></svg></span></button><div class="details" id="journey-details-${journeyIndex}" hidden>${details}<p class="ticket-note">${t.scheduled}${number > 1 ? ` ${t.separate}` : ""}</p><button type="button" class="details-close" aria-controls="journey-details-${journeyIndex}">${t.hideDetails} <span aria-hidden="true">⌃</span></button></div>${ticketBar}</article>`;
  }

  function sellerUrl(raw) {
    try {
      const url = new URL(raw);
      const hosts = new Set(["www.bezrindas.lv", "1188.bezrindas.lv"]);
      if (url.protocol !== "https:" || !hosts.has(url.hostname) || url.username || url.password || url.port || url.hash) return null;
      const values = [...url.searchParams.entries()], names = values.map(([name]) => name);
      const allowed = new Set(["departure_id", "destination_id", "departure_date", "departure_race_id", "quantity"]);
      const exact = ["/lv/train/prepare_ltc", "/lv/bus/prepare_ltc"].includes(url.pathname);
      if (exact) {
        if (names.length !== new Set(names).size || names.some(name => !allowed.has(name))) return null;
        const train = url.pathname === "/lv/train/prepare_ltc", station = train ? /^\d+V$/ : /^\d+$/;
        if (!station.test(url.searchParams.get("departure_id") || "") || !station.test(url.searchParams.get("destination_id") || "") || !/^\d+$/.test(url.searchParams.get("departure_race_id") || "") || !/^\d{4}-\d\d-\d\d$/.test(url.searchParams.get("departure_date") || "") || (url.searchParams.has("quantity") && url.searchParams.get("quantity") !== "1")) return null;
        return {url:url.href, exact:true};
      }
      if (["/lv/autobusu-biletes", "/lv/vilcienu-biletes"].includes(url.pathname) && !names.length) return {url:url.href, exact:false};
      if (url.pathname.match(/^\/lv\/bus\/choose\/\d+\/\d+\/1\/\d{8}\/0$/) && !names.length) return {url:url.href, exact:false};
      return null;
    } catch (_) { return null; }
  }
  function validMinor(value) { if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value; if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value))) return Number(value); return null; }
  function quotePrice(quote) {
    const fare = validMinor(quote?.fare_minor), fee = validMinor(quote?.fee_minor), total = validMinor(quote?.total_minor);
    if (fare === null || fee === null || total === null || fare + fee !== total || quote.currency !== "EUR") return t.fareUnknown;
    try { return new Intl.NumberFormat(lv ? "lv-LV" : "en-GB", {style:"currency", currency:"EUR"}).format(total / 100); } catch (_) { return t.fareUnknown; }
  }
  function applyTicket(card, key, result) {
    if (!card.isConnected || !result || typeof result !== "object") return;
    const items = [...card.querySelectorAll(`.ticket-item[data-ticket-key="${CSS.escape(key)}"]`)];
    const destination = sellerUrl(result.url), exact = result.match === "exact" && destination?.exact, search = result.match === "search" && destination;
    for (const item of items) {
      let link = item.querySelector(".ticket-link");
      if (link?.tagName === "BUTTON") {
        const focused = document.activeElement === link, anchor = document.createElement("a");
        anchor.className = link.className; anchor.dataset.placement = "result"; anchor.dataset.ticketCta = "";
        anchor.rel = "noreferrer"; anchor.innerHTML = link.innerHTML;
        anchor.href = exact || search ? destination.url : sellerUrl(item.dataset.ticketGeneric)?.url || "https://www.bezrindas.lv/lv/autobusu-biletes";
        link.replaceWith(anchor); link = anchor;
        if (focused) anchor.focus({preventScroll:true});
      }
      const action = item.querySelector("[data-ticket-action]"), fare = item.querySelector("[data-ticket-price]");
      const icon = item.querySelector("[data-ticket-icon]"); if (icon) icon.textContent = "→";
      if (fare) { const value = result.price ? quotePrice(result.price) : t.fareUnknown; fare.textContent = value === t.fareUnknown ? t.sellerFareUnknown : `${t.ticketPrice}: ${value}`; }
      const checked = item.querySelector("[data-ticket-checked]"), checkDate = new Date(result.price?.checked_at || "");
      if (checked) checked.textContent = !Number.isNaN(+checkDate) ? `${t.checked}: ${new Intl.DateTimeFormat(lv ? "lv-LV" : "en-GB", {dateStyle:"short", timeStyle:"short", hourCycle:"h23", timeZone:"Europe/Riga"}).format(checkDate)}` : "";
      if (exact && link) { link.href = destination.url; if (action) action.textContent = t.ticketExact; }
      else if (search && link) { link.href = destination.url; if (action) action.textContent = t.ticketSearch; }
      else if (link) { link.href = sellerUrl(item.dataset.ticketGeneric)?.url || "https://www.bezrindas.lv/lv/autobusu-biletes"; if (action) action.textContent = t.ticketSearch; }
    }
  }
  let ticketEpoch = 0, ticketActive = 0, ticketCursor = [], ticketControllers = new Set(), ticketCache = new Map(), ticketPending = new Map();
  function clearTicketRequests() {
    ticketEpoch += 1; ticketControllers.forEach(controller => controller.abort()); ticketControllers.clear();
    ticketCursor.splice(0).forEach(task => task.resolve(null)); ticketCache = new Map(); ticketPending = new Map();
  }
  function runTicketQueue() {
    while (ticketActive < 2 && ticketCursor.length) {
      const task = ticketCursor.shift();
      if (task.epoch !== ticketEpoch) { task.resolve(null); if (ticketPending.get(task.query) === task.promise) ticketPending.delete(task.query); continue; }
      ticketActive += 1; const controller = new AbortController(); ticketControllers.add(controller);
      api(`tickets?${task.query}`, controller.signal).then(result => {
        if (task.epoch === ticketEpoch) ticketCache.set(task.query, result); task.resolve(task.epoch === ticketEpoch ? result : null);
      }).catch(() => task.resolve(null)).finally(() => { ticketActive -= 1; ticketControllers.delete(controller); if (ticketPending.get(task.query) === task.promise) ticketPending.delete(task.query); runTicketQueue(); });
    }
  }
  function requestTicket(query, epoch) {
    if (epoch !== ticketEpoch) return Promise.resolve(null);
    if (ticketCache.has(query)) return Promise.resolve(ticketCache.get(query));
    if (ticketPending.has(query)) return ticketPending.get(query);
    let resolve; const promise = new Promise(done => { resolve = done; });
    ticketPending.set(query,promise); ticketCursor.push({query,epoch,resolve,promise}); runTicketQueue(); return promise;
  }
  async function resolveTickets(card) {
    if (card.dataset.ticketsResolved) return; card.dataset.ticketsResolved = "true"; const epoch = ticketEpoch;
    const requests = new Map();
    card.querySelectorAll(".ticket-item[data-ticket-query]").forEach(item => {
      const key = item.dataset.ticketKey, query = item.dataset.ticketQuery;
      if (key && query && !requests.has(query)) requests.set(query, {query, keys:[]});
      if (key && query) requests.get(query).keys.push(key);
      const price = item.querySelector("[data-ticket-price]"); if (price) price.textContent = t.fareLoading;
      const button = item.querySelector("button[data-ticket-reveal]");
      if (button) { button.setAttribute("aria-disabled", "true"); button.querySelector("[data-ticket-action]").textContent = t.fareLoading; }
    });
    await Promise.all([...requests.values()].map(async task => {
      const result = await requestTicket(task.query, epoch);
      if (epoch === ticketEpoch) task.keys.forEach(key => applyTicket(card,key,result || {match:"unavailable"}));
    }));
  }

  $("#result-list").addEventListener("click", event => {
    const button = event.target.closest("button[data-ticket-reveal]");
    if (!button || button.getAttribute("aria-disabled") === "true") return;
    const card = button.closest(".card"), toggle = card.querySelector(".transit-main");
    if (toggle.getAttribute("aria-expanded") !== "true") toggle.click();
    resolveTickets(card);
  });

  function price(o) {
    const minor = o.price_minor;
    if (minor == null || minor === "" || typeof minor === "boolean" || !Number.isSafeInteger(Number(minor)) || Number(minor) < 0) return t.unknown;
    if (Number(minor) === 0) return t.free;
    const currency = o.currency || "EUR";
    if (!/^[A-Z]{3}$/.test(currency)) return t.unknown;
    try { return new Intl.NumberFormat(lv ? "lv-LV" : "en-GB", {style:"currency", currency}).format(Number(minor) / 100); } catch (_) { return t.unknown; }
  }
  function cacheLabel(o) { let seconds = o.age_seconds == null ? NaN : Number(o.age_seconds); if (!Number.isFinite(seconds) && o.cached_at) { const cached = new Date(o.cached_at).getTime(); seconds = Number.isFinite(cached) ? Math.max(0, Math.round((Date.now() - cached) / 1000)) : NaN; } if (!Number.isFinite(seconds)) return ""; return seconds < 60 ? `${t.updated}: ${t.justNow}` : `${t.updated}: ${Math.floor(seconds / 60)} min`; }
  function rigaDate(value) { const parsed = new Date(value); if (Number.isNaN(+parsed)) return ""; const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Riga",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(parsed).map(part => [part.type,part.value])); return `${parts.year}-${parts.month}-${parts.day}`; }
  function overnight(arrival, departure) { const a = rigaDate(arrival), d = rigaDate(departure); if (!a || !d || a === d) return ""; const delta = Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 86400000); return delta > 0 ? `<small>+${delta} ${lv ? "d." : "d"}</small>` : ""; }
  function carpool(o) {
    const seats = Number(o.seats_available) || 0;
    const arrivalNote = o.arrival ? `<span class="arrival-label">${t.arrival}</span>` : "";
    const durationLabel = o.duration_minutes == null ? "" : esc(duration(o.duration_minutes));
    return `<article class="card carpool"><div class="carpool-main"><span class="badge">Shurp</span><div class="line"><span class="time"><strong>${esc(clock(o.departure))}</strong><small>${esc(o.origin?.name || "—")}</small></span><i class="track" aria-hidden="true"></i><span class="time end"><strong>${esc(clock(o.arrival))}</strong><small>${esc(o.destination?.name || "—")}</small>${overnight(o.arrival, o.departure)}</span><span class="meta">${durationLabel ? `<span class="ride-duration">${durationLabel}</span>` : ""}${arrivalNote}</span></div></div><div class="carpool-footer"><img class="carpool-logo" src="${esc(basePath)}/assets/apple-touch-icon.png" alt="" width="48" height="48"><div class="offer-meta"><span>${esc(seats === 1 ? t.seat1 : `${seats} ${t.seat}`)}</span><strong>${esc(price(o))}</strong><span>${t.check}</span><span>${esc(cacheLabel(o))}</span></div><a class="carpool-cta" data-placement="result" href="${esc(document.body.dataset.websiteBase + "/get")}">${t.reserve}</a></div><div class="local-endpoints">${t.local}: <span>${esc(o.origin?.name || "—")} → ${esc(o.destination?.name || "—")}</span> · ${o.match_kind === "nearby" ? t.nearby : t.city}</div></article>`;
  }
  const group = (title, content) => `<section class="group"><h3>${title}</h3>${content}</section>`;
  const notice = status => status === "unavailable" ? t.unavailable : status === "pending" || status === "disabled" ? t.pending : status === "stale" ? t.stale : "";
  let searchController, searchVersion = 0;
  $("#planner").onsubmit = async event => {
    event.preventDefault();
    if (!selected.from || !selected.to) { $("#summary").textContent = t.pick; return; }
    if (selected.from.id === selected.to.id) { $("#summary").textContent = t.same; return; }
    const entry = window.ShurpPlannerInputs.read();
    if (!entry || !$("#planner").checkValidity()) { $("#summary").textContent = t.invalid; return; }
    searchController?.abort(); clearTicketRequests(); searchController = new AbortController(); const version = ++searchVersion;
    const mode = modes.find(el => el.checked).value;
    const q = new URLSearchParams({from:selected.from.id, to:selected.to.id, date:entry.date, time:entry.time, mode, max_transfers:"2"});
    $("#summary").textContent = t.loading; $("#result-list").innerHTML = ""; $("#result-list").setAttribute("aria-busy", "true");
    // Move out of the inputs (and dismiss mobile keyboards) before revealing
    // feedback. Responses only update this region; they never move focus again.
    $("#results").classList.add("search-started");
    const resultsHeading = $("#results-heading");
    resultsHeading.focus({preventScroll:true});
    resultsHeading.scrollIntoView({block:"start", behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"});
    try {
      const data = await api(`journeys?${q}`, searchController.signal);
      if (version !== searchVersion) return;
      const journeys = (Array.isArray(data.journeys) ? data.journeys : []).filter(item => item && typeof item === "object").sort((a, b) => { const delta = Date.parse(a.departure) - Date.parse(b.departure); return Number.isFinite(delta) ? delta : String(a.departure || "").localeCompare(String(b.departure || "")); });
      const carpools = (Array.isArray(data.carpool_offers) ? data.carpool_offers : []).filter(item => item && typeof item === "object");
      const transitOn = mode !== "carpool", carpoolOn = mode === "all" || mode === "carpool", info = notice(data.provider_status?.shurp?.status), counts = [];
      if (carpoolOn && carpools.length) counts.push(`${carpools.length} ${lv ? "kopbraucieni" : "carpools"}`);
      if (transitOn && journeys.length) counts.push(`${journeys.length} ${lv ? "reisi" : "journeys"}`);
      $("#summary").textContent = counts.join(" · ") || t.none;
      const carpoolGroup = carpoolOn && (carpools.length || mode === "carpool" || info) ? group(t.carpool, `${info ? `<p class="status">${esc(info)}</p>` : ""}${carpools.length ? carpools.map(carpool).join("") : `<p class="empty">${t.none}</p>`}`) : "";
      const transitGroup = transitOn && (journeys.length || !carpools.length) ? group(t.transit, journeys.length ? journeys.map(transit).join("") : `<p class="empty">${t.none}</p>`) : "";
      $("#result-list").innerHTML = `${carpoolGroup}${transitGroup}`;
      document.querySelectorAll(".transit-main").forEach(button => {
        const details = button.nextElementSibling;
        button.onclick = () => {
          details.hidden = !details.hidden;
          button.setAttribute("aria-expanded", String(!details.hidden));
          button.querySelector("[data-details-label]").textContent = details.hidden ? t.showDetails : t.hideDetails;
        };
        details.querySelector(".details-close").onclick = () => {
          button.click();
          button.focus({preventScroll:true});
          const bounds = button.getBoundingClientRect();
          if (bounds.top < 0 || bounds.bottom > window.innerHeight) button.scrollIntoView({block:"nearest", behavior:"instant"});
        };
      });
    } catch (error) {
      if (version !== searchVersion || error.name === "AbortError") return;
      $("#summary").textContent = t.failed;
    } finally { if (version === searchVersion) $("#result-list").setAttribute("aria-busy", "false"); }
  };
})();
