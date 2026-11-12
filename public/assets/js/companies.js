(function () {
  var story = document.getElementById("story");
  var stage = document.getElementById("story-stage");
  if (!story || !stage) return;

  var words = Array.prototype.slice.call(stage.querySelectorAll(".story-line .w"));
  var storyCopy = stage.querySelector(".story-copy");
  var moon = stage.querySelector(".layer-moon");
  var phoneDuo = stage.querySelector(".phone-duo");
  var phoneOff = stage.querySelector(".phone-off");
  var phoneOn = stage.querySelector(".phone-on");
  var captionWorks = stage.querySelector(".caption-works");
  var captionInsight = stage.querySelector(".caption-insight");
  var hint = stage.querySelector(".scroll-hint");
  var compactMq =
    window.matchMedia && window.matchMedia("(max-width: 960px)");
  var isCompact = compactMq ? compactMq.matches : false;

  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function map(p, a, b) {
    if (b === a) return 0;
    return clamp((p - a) / (b - a), 0, 1);
  }

  /* Decelerate into rest — soft landing, no overshoot. */
  function easeOut(t) {
    return 1 - Math.pow(1 - t, 2.4);
  }

  function setCaption(el, amount) {
    if (!el) return;
    el.style.opacity = String(amount);
    el.style.transform =
      "translateY(" + ((1 - amount) * 14).toFixed(2) + "px)";
  }

  function apply(p) {
    stage.style.setProperty("--p", String(p));
    isCompact = compactMq ? compactMq.matches : false;

    words.forEach(function (word, i) {
      var start = 0.03 + i * 0.025;
      var on = p >= start;
      word.classList.toggle("is-on", on);
      if (on) {
        word.style.transition =
          "opacity 0.35s ease, filter 0.35s ease, transform 0.35s ease";
      }
    });

    /*
      Large screens: hero title stays for the whole scrub (prev. locked look).
      Compact screens: title yields so the phone + captions can own the frame.
    */
    if (storyCopy) {
      if (isCompact) {
        /* Hold the title longer on mobile, then yield to the phone mock. */
        var copyOut = easeOut(map(p, 0.34, 0.46));
        storyCopy.style.opacity = String(1 - copyOut);
        storyCopy.style.transform =
          "translateY(" + (-14 * copyOut).toFixed(2) + "px)";
        storyCopy.style.pointerEvents = copyOut > 0.85 ? "none" : "";
      } else {
        storyCopy.style.opacity = "1";
        storyCopy.style.transform = "";
        storyCopy.style.pointerEvents = "";
      }
    }

    /* Moon holds as the scene; soft scale only (earth removed) */
    var moonScale = 1.08 + map(p, 0, 0.36) * 0.08;
    moon.style.transform = "scale(" + moonScale.toFixed(3) + ")";
    moon.style.opacity = String(
      1 - map(p, isCompact ? 0.34 : 0.26, isCompact ? 0.5 : 0.44) * 0.2
    );

    /* Rise from below + scale settle — ease-out landing */
    var phoneRaw = map(p, isCompact ? 0.44 : 0.32, isCompact ? 0.58 : 0.48);
    var phoneIn = easeOut(phoneRaw);
    if (phoneDuo) {
      var yBase = isCompact ? -30 : -46;
      var yTravel = isCompact ? 56 : 48;
      var y = yBase + (1 - phoneIn) * yTravel;
      var scale = 0.88 + phoneIn * 0.12;
      phoneDuo.style.opacity = String(Math.min(phoneIn, 1));
      phoneDuo.style.transform =
        "translate(-50%, " + y.toFixed(2) + "%) scale(" + scale.toFixed(3) + ")";
    }

    /* Hold “works” on mock 1, then hard-cut to mock 2 + insight */
    var worksIn = easeOut(
      map(p, isCompact ? 0.6 : 0.5, isCompact ? 0.68 : 0.58)
    );
    var tapRaw = map(p, 0.76, 0.795);
    var tap = tapRaw <= 0 ? 0 : tapRaw >= 1 ? 1 : tapRaw < 0.5 ? 0 : 1;
    setCaption(captionWorks, worksIn * (1 - tap));

    if (phoneOn) phoneOn.style.opacity = String(tap);
    if (phoneOff) phoneOff.style.opacity = String(1 - tap);
    setCaption(captionInsight, tap);

    if (hint) {
      hint.style.opacity = String(1 - map(p, 0.05, 0.14));
    }
  }

  function progress() {
    var rect = story.getBoundingClientRect();
    var total = story.offsetHeight - window.innerHeight;
    if (total <= 0) return 1;
    return clamp(-rect.top / total, 0, 1);
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      apply(progress());
      ticking = false;
    });
  }

  if (!reduce) {
    apply(0);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
  }

  /* —— How-it-works pin: reveal 1→2→3, then grow admin metrics —— */
  (function initAdminInsights() {
    var scrubEl = document.getElementById("admin-scrub");
    var pinEl = scrubEl && scrubEl.querySelector(".admin-scrub-pin");
    var stageEl = document.getElementById("admin-scrub-stage");
    if (!scrubEl || !pinEl || !stageEl) return;

    var empMin = parseInt(scrubEl.getAttribute("data-employees-min") || "2", 10);
    var empMax = parseInt(scrubEl.getAttribute("data-employees-max") || "34", 10);
    var seats = parseInt(scrubEl.getAttribute("data-seats") || "100", 10);
    var tripsPerEmp = parseFloat(scrubEl.getAttribute("data-trips-per-emp") || "1");
    var isLv = document.documentElement.lang === "lv";
    var mobileMq = window.matchMedia("(max-width: 859px)");

    /* Share of trips/passengers across top routes (sums to 1). */
    var routeShares = [0.28, 0.18, 0.16, 0.14, 0.14, 0.1];

    var elEmployees = stageEl.querySelectorAll('[data-admin="employees"]');
    var elSeats = stageEl.querySelectorAll('[data-admin="seats"]');
    var elCo2 = stageEl.querySelectorAll('[data-admin="co2"]');
    var elEur = stageEl.querySelectorAll('[data-admin="eur"]');
    var elKm = stageEl.querySelectorAll('[data-admin="km"]');
    var routeRows = Array.prototype.slice.call(
      stageEl.querySelectorAll("[data-route-row]")
    );

    /* Plain per-trip constants from HTML (no pricing formulas in this repo). */
    var routeKm = routeRows.map(function (row) {
      return parseFloat(row.getAttribute("data-km") || "0") || 0;
    });
    var routeSaveEur = routeRows.map(function (row) {
      return parseFloat(row.getAttribute("data-save-eur") || "0") || 0;
    });
    var routeCo2Kg = routeRows.map(function (row) {
      return parseFloat(row.getAttribute("data-co2-kg") || "0") || 0;
    });

    elSeats.forEach(function (el) {
      el.textContent = String(seats);
    });

    function formatInt(n) {
      var s = String(Math.round(n));
      if (isLv) return s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
      return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    /* Largest-remainder split so integer parts always sum to total */
    function distributeInt(total, shares, count) {
      var n = Math.max(0, Math.round(total));
      var raw = [];
      var floors = [];
      var i;
      for (i = 0; i < count; i++) {
        var share = shares[i] != null ? shares[i] : 0;
        var value = n * share;
        raw.push(value);
        floors.push(Math.floor(value));
      }
      var used = 0;
      for (i = 0; i < floors.length; i++) used += floors[i];
      var rem = n - used;
      var order = raw
        .map(function (value, idx) {
          return { i: idx, frac: value - floors[idx] };
        })
        .sort(function (a, b) {
          return b.frac - a.frac;
        });
      for (i = 0; i < rem; i++) floors[order[i % order.length].i] += 1;
      return floors;
    }

    function applyAdmin(grow) {
      var employees = Math.round(empMin + grow * (empMax - empMin));
      var trips = Math.max(1, Math.round(employees * tripsPerEmp));
      var paxRides = trips * 2;
      var count = routeRows.length || routeShares.length;
      var tripParts = distributeInt(trips, routeShares, count);
      var paxParts = distributeInt(paxRides, routeShares, count);

      var km = 0;
      var eur = 0;
      var co2 = 0;
      var i;
      for (i = 0; i < count; i++) {
        var pax = paxParts[i] || 0;
        km += pax * (routeKm[i] || 0);
        eur += pax * (routeSaveEur[i] || 0);
        co2 += pax * (routeCo2Kg[i] || 0);
      }

      elEmployees.forEach(function (el) {
        el.textContent = String(employees);
      });
      elCo2.forEach(function (el) {
        el.textContent = formatInt(co2);
      });
      elEur.forEach(function (el) {
        el.textContent = "€" + formatInt(eur);
      });
      elKm.forEach(function (el) {
        el.textContent = formatInt(km);
      });

      routeRows.forEach(function (row, idx) {
        var start = idx * 0.09;
        var rowIn = easeOut(map(grow, start, Math.min(1, start + 0.28)));
        row.style.setProperty("--route-in", String(rowIn));

        var tripsEl = row.querySelector('[data-route="trips"]');
        var paxEl = row.querySelector('[data-route="pax"]');
        var co2El = row.querySelector('[data-route="co2"]');
        var rowCo2 = (paxParts[idx] || 0) * (routeCo2Kg[idx] || 0);
        if (tripsEl) tripsEl.textContent = String(tripParts[idx] || 0);
        if (paxEl) paxEl.textContent = String(paxParts[idx] || 0);
        if (co2El) co2El.textContent = formatInt(rowCo2) + " kg";
      });
    }

    function applyHow(progress) {
      pinEl.style.setProperty("--how", String(progress));
      /* Metrics start rising once step 3 is mostly on screen */
      applyAdmin(easeOut(map(progress, 0.48, 0.98)));
    }

    function stickyTopPx() {
      var top = window.getComputedStyle(pinEl).top;
      var n = parseFloat(top);
      return isNaN(n) ? 0 : n;
    }

    function adminProgress() {
      if (mobileMq.matches) return 1;
      var rect = scrubEl.getBoundingClientRect();
      var pinH = pinEl.offsetHeight;
      var travel = scrubEl.offsetHeight - pinH;
      if (travel <= 0) return 1;
      var engaged = stickyTopPx() - rect.top;
      return clamp(engaged / travel, 0, 1);
    }

    var adminTicking = false;
    var scrubBound = false;

    function onAdminScroll() {
      if (adminTicking) return;
      adminTicking = true;
      window.requestAnimationFrame(function () {
        applyHow(adminProgress());
        adminTicking = false;
      });
    }

    function bindScrub() {
      if (scrubBound) return;
      scrubBound = true;
      window.addEventListener("scroll", onAdminScroll, { passive: true });
      window.addEventListener("resize", onAdminScroll);
    }

    function unbindScrub() {
      if (!scrubBound) return;
      scrubBound = false;
      window.removeEventListener("scroll", onAdminScroll);
      window.removeEventListener("resize", onAdminScroll);
    }

    function syncAdminMode() {
      if (reduce || mobileMq.matches) {
        unbindScrub();
        applyHow(1);
        return;
      }
      bindScrub();
      onAdminScroll();
    }

    syncAdminMode();
    if (typeof mobileMq.addEventListener === "function") {
      mobileMq.addEventListener("change", syncAdminMode);
    } else if (typeof mobileMq.addListener === "function") {
      mobileMq.addListener(syncAdminMode);
    }
  })();

  /* —— Safe mailto: assembled in JS so scrapers do not see a raw address —— */
  (function hydrateSafeEmails() {
    var nodes = document.querySelectorAll("[data-safe-email]");
    if (!nodes.length) return;
    var domain = "shurp.lv";
    Array.prototype.forEach.call(nodes, function (el) {
      if (el.getAttribute("data-safe-ready") === "1") return;
      var user = (el.getAttribute("data-safe-email") || "info").replace(/[^a-z0-9._+-]/gi, "");
      if (!user) return;
      var email = user + "@" + domain;
      var link = document.createElement("a");
      link.href = "mailto:" + email;
      link.textContent = email;
      link.className = "safe-email-link";
      el.replaceChildren(link);
      el.setAttribute("data-safe-ready", "1");
    });
  })();

  /* —— Request form —— */
  var form = document.getElementById("b2b-form");
  if (!form) return;

  var HELP_ENDPOINT =
    "https://okyprkffbuorrtlhnplf.supabase.co/functions/v1/help-request";
  var TURNSTILE_SITEKEY = "0x4AAAAAACjXgi-e6gTBacXk";
  var lang = document.documentElement.lang || "en";
  var statusEl = document.getElementById("form-status");
  var submitBtn = document.getElementById("b2b-submit");
  var sentEl = document.getElementById("form-sent");
  var turnstileHost = document.getElementById("turnstile-slot");
  var turnstileWidgetId = null;
  var pendingResolve = null;
  var formSent = false;
  var planSelect = form.plan;
  var planCards = Array.prototype.slice.call(
    document.querySelectorAll(".plan[data-plan]")
  );
  var requestSection = document.getElementById("request");
  var requestTitle = document.getElementById("request-title");
  var requestCaption = document.getElementById("request-caption");
  var requestLead = document.getElementById("request-lead");
  var selectTimer = null;
  var selectLabels = {
    en: { select: "Select", selected: "Selected" },
    lv: { select: "Izvēlēties", selected: "Izvēlēts" },
  };
  var labels = selectLabels[lang === "lv" ? "lv" : "en"];
  var defaultLead = requestLead ? requestLead.textContent : "";

  function markPlanCards(plan) {
    planCards.forEach(function (card) {
      var selected = card.getAttribute("data-plan") === plan;
      card.classList.toggle("is-selected", selected);
      card.setAttribute("aria-checked", selected ? "true" : "false");
      card.tabIndex = selected ? 0 : -1;
      var cta = card.querySelector(".plan-cta");
      if (cta) cta.textContent = selected ? labels.selected : labels.select;
    });
    if (!plan && planCards[0]) planCards[0].tabIndex = 0;
  }

  function setRequestPrompt(plan) {
    if (!requestTitle || !requestCaption) return;
    if (!plan) {
      requestTitle.textContent =
        requestTitle.getAttribute("data-default") || requestTitle.textContent;
      requestCaption.hidden = true;
      requestCaption.textContent = "";
      if (requestSection) requestSection.classList.remove("is-ready");
      if (requestLead && defaultLead) requestLead.textContent = defaultLead;
      return;
    }
    requestTitle.textContent =
      requestTitle.getAttribute("data-ready") || requestTitle.textContent;
    requestCaption.hidden = false;
    requestCaption.textContent =
      lang === "lv" ? "Izvēlēts: " + plan : plan + " selected";
    if (requestSection) requestSection.classList.add("is-ready");
    if (requestLead) {
      requestLead.textContent =
        lang === "lv"
          ? "Aizpildiet pieteikumu zemāk — plāns jau ir iestatīts."
          : "Fill in your details below — your plan is already set.";
    }
  }

  function applyPlanChoice(plan, options) {
    var opts = options || {};
    if (!plan || !planSelect) return;
    planSelect.value = plan;
    markPlanCards(plan);
    setRequestPrompt(plan);

    if (opts.scroll === false) return;

    window.clearTimeout(selectTimer);
    selectTimer = window.setTimeout(function () {
      if (requestSection) {
        requestSection.scrollIntoView({
          behavior: reduce ? "auto" : "smooth",
          block: "start",
        });
      }
      window.setTimeout(function () {
        var company = form.company;
        if (company && typeof company.focus === "function") company.focus();
      }, reduce ? 0 : 280);
    }, reduce ? 0 : 480);
  }

  planCards.forEach(function (card) {
    var more = card.querySelector(".plan-more");
    if (more) {
      more.addEventListener("click", function (event) {
        event.stopPropagation();
      });
      more.addEventListener("keydown", function (event) {
        event.stopPropagation();
      });
    }
    card.addEventListener("click", function () {
      applyPlanChoice(card.getAttribute("data-plan"));
    });
    card.addEventListener("keydown", function (event) {
      var index = planCards.indexOf(card);
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        applyPlanChoice(card.getAttribute("data-plan"));
        return;
      }
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        var next = planCards[(index + 1) % planCards.length];
        next.focus();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        var prev = planCards[(index - 1 + planCards.length) % planCards.length];
        prev.focus();
      }
    });
  });

  if (planSelect) {
    planSelect.addEventListener("change", function () {
      var value = (planSelect.value || "").trim();
      if (!value || value === "Not sure") {
        markPlanCards("");
        setRequestPrompt("");
        return;
      }
      applyPlanChoice(value, { scroll: false });
    });
  }

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.classList.remove("is-ok", "is-err");
    if (kind) statusEl.classList.add(kind);
  }

  function clearFieldErrors() {
    Array.prototype.forEach.call(form.querySelectorAll(".field.is-invalid"), function (field) {
      field.classList.remove("is-invalid");
    });
    Array.prototype.forEach.call(form.querySelectorAll("[aria-invalid]"), function (el) {
      el.removeAttribute("aria-invalid");
    });
  }

  function markFieldInvalid(el) {
    if (!el) return;
    el.setAttribute("aria-invalid", "true");
    var field = el.closest ? el.closest(".field") : null;
    if (field) field.classList.add("is-invalid");
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value);
  }

  function isValidPhone(value) {
    var digits = value.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return false;
    return /^[+]?[\d\s()./-]{8,22}$/.test(value);
  }

  function joinList(items, isLv) {
    if (!items.length) return "";
    if (items.length === 1) return items[0];
    if (items.length === 2) {
      return items[0] + (isLv ? " un " : " and ") + items[1];
    }
    var last = items[items.length - 1];
    return (
      items.slice(0, -1).join(", ") +
      (isLv ? " un " : ", and ") +
      last
    );
  }

  function validateForm(data) {
    clearFieldErrors();
    var isLv = lang === "lv";
    var missing = [];
    var formatIssues = [];
    var firstInvalid = null;

    function fail(el, list, label) {
      markFieldInvalid(el);
      list.push(label);
      if (!firstInvalid) firstInvalid = el;
    }

    if (!data.company) {
      fail(form.company, missing, isLv ? "uzņēmumu" : "company");
    }
    if (!data.contact) {
      fail(form.contact, missing, isLv ? "kontaktu" : "contact");
    }
    if (!data.email) {
      fail(form.email, missing, isLv ? "e-pastu" : "email");
    } else if (!isValidEmail(data.email)) {
      fail(form.email, formatIssues, isLv ? "e-pasta adresi" : "email");
    }
    if (data.phone && !isValidPhone(data.phone)) {
      fail(form.phone, formatIssues, isLv ? "tālruņa numuru" : "phone");
    }
    if (!data.plan) {
      fail(form.plan, missing, isLv ? "plānu" : "plan");
    }

    if (!missing.length && !formatIssues.length) return true;

    var parts = [];
    if (missing.length) {
      parts.push(
        isLv
          ? "Lūdzu aizpildi: " + joinList(missing, true) + "."
          : "Please fill: " + joinList(missing, false) + "."
      );
    }
    if (formatIssues.length) {
      parts.push(
        isLv
          ? "Pārbaudi: " + joinList(formatIssues, true) + "."
          : "Please check: " + joinList(formatIssues, false) + "."
      );
    }
    setStatus(parts.join(" "), "is-err");
    if (firstInvalid && typeof firstInvalid.focus === "function") {
      firstInvalid.focus();
    }
    return false;
  }

  ["company", "contact", "email", "phone", "plan"].forEach(function (name) {
    var el = form[name];
    if (!el) return;
    var eventName = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(eventName, function () {
      var field = el.closest ? el.closest(".field") : null;
      if (field) field.classList.remove("is-invalid");
      el.removeAttribute("aria-invalid");
      if (statusEl && statusEl.classList.contains("is-err")) setStatus("", null);
    });
  });

  function renderTurnstile() {
    if (!turnstileHost || turnstileWidgetId !== null || !window.turnstile) return;
    turnstileWidgetId = window.turnstile.render(turnstileHost, {
      sitekey: TURNSTILE_SITEKEY,
      size: "invisible",
      callback: function (token) {
        if (pendingResolve) {
          pendingResolve(token);
          pendingResolve = null;
        }
      },
      "error-callback": function () {
        if (pendingResolve) {
          pendingResolve(null);
          pendingResolve = null;
        }
      },
      "expired-callback": function () {
        if (pendingResolve) {
          pendingResolve(null);
          pendingResolve = null;
        }
      },
    });
  }

  function getToken() {
    return new Promise(function (resolve) {
      if (!window.turnstile || turnstileWidgetId === null) {
        resolve(null);
        return;
      }
      var existing = window.turnstile.getResponse(turnstileWidgetId);
      if (existing) {
        resolve(existing);
        return;
      }
      pendingResolve = resolve;
      window.turnstile.execute(turnstileWidgetId);
    });
  }

  function resetTurnstile() {
    if (window.turnstile && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
    }
  }

  function buildMessage(data) {
    var planLine =
      data.plan === "Not sure"
        ? data.contact +
          " from " +
          data.company +
          " requested a demo (plan not chosen yet)."
        : data.contact +
          " from " +
          data.company +
          " requested the " +
          data.plan +
          " plan.";
    var lines = [
      planLine,
      "",
      "Company: " + data.company,
      "Contact: " + data.contact,
      "Work email: " + data.email,
      "Phone: " + (data.phone || "—"),
      "Headcount: " + (data.headcount || "—"),
      "Plan: " + data.plan,
      "Address: " + (data.address || "—"),
    ];
    if (data.note) {
      lines.push("", "Note:", data.note);
    }
    return lines.join("\n");
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (formSent) return;
    var data = {
      company: (form.company.value || "").trim(),
      contact: (form.contact.value || "").trim(),
      email: (form.email.value || "").trim(),
      phone: (form.phone.value || "").trim(),
      headcount: (form.headcount.value || "").trim(),
      address: (form.address.value || "").trim(),
      plan: (form.plan.value || "").trim(),
      note: (form.note.value || "").trim(),
    };

    if (!validateForm(data)) return;

    var original = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = lang === "lv" ? "Sūta…" : "Sending…";
    setStatus("", null);

    getToken()
      .then(function (token) {
        if (!token) throw new Error("turnstile");
        return fetch(HELP_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: buildMessage(data),
            type:
              lang === "lv" ? "Uzņēmumu pieprasījums" : "Workplace enquiry",
            lang: lang,
            contact_email: data.email,
            turnstile_token: token,
            page_url: window.location.href,
            user_agent: navigator.userAgent,
            source: "web",
          }),
        });
      })
      .then(function (response) {
        if (!response.ok) throw new Error("http");
        formSent = true;
        form.classList.add("is-sent");
        Array.prototype.forEach.call(form.elements, function (el) {
          el.disabled = true;
        });
        planCards.forEach(function (card) {
          card.setAttribute("tabindex", "-1");
          card.setAttribute("aria-disabled", "true");
        });
        if (sentEl) {
          sentEl.hidden = false;
          sentEl.setAttribute("role", "status");
          sentEl.setAttribute("aria-live", "polite");
        }
        setStatus("", null);
        resetTurnstile();
      })
      .catch(function () {
        setStatus(
          lang === "lv"
            ? "Šobrīd neizdevās nosūtīt. Mēģini vēlreiz."
            : "Could not send just now. Please try again.",
          "is-err"
        );
        resetTurnstile();
      })
      .finally(function () {
        if (formSent) return;
        submitBtn.disabled = false;
        submitBtn.textContent = original;
      });
  });

  if (window.turnstile) {
    renderTurnstile();
  } else {
    var wait = setInterval(function () {
      if (window.turnstile) {
        clearInterval(wait);
        renderTurnstile();
      }
    }, 200);
  }
})();
