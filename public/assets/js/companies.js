(function () {
  var story = document.getElementById("story");
  var stage = document.getElementById("story-stage");
  if (!story || !stage) return;

  var words = Array.prototype.slice.call(stage.querySelectorAll(".story-line .w"));
  var storyCopy = stage.querySelector(".story-copy");
  var moon = stage.querySelector(".layer-moon");
  var earth = stage.querySelector(".layer-earth");
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

  function easeOut(t) {
    return 1 - Math.pow(1 - t, 2.4);
  }

  /* Mild overshoot — rise, pass the mark, settle. */
  function easeOutBack(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    var c1 = 1.45;
    var c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
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

    /* Moon → earth, with longer holds between beats */
    var moonScale = 1.08 + map(p, 0, 0.36) * 0.08;
    moon.style.transform = "scale(" + moonScale.toFixed(3) + ")";
    moon.style.opacity = String(
      1 - map(p, isCompact ? 0.34 : 0.26, isCompact ? 0.5 : 0.44) * 0.85
    );

    var earthIn = easeOut(
      map(p, isCompact ? 0.36 : 0.28, isCompact ? 0.5 : 0.44)
    );
    earth.style.opacity = String(earthIn);
    earth.style.transform =
      "translate(-50%, -50%) scale(" + (0.9 + earthIn * 0.1).toFixed(3) + ")";

    /* Rise from below + scale settle with a light overshoot */
    var phoneRaw = map(p, isCompact ? 0.44 : 0.32, isCompact ? 0.58 : 0.48);
    var phoneIn = easeOutBack(phoneRaw);
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
      if (!value) {
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
    var lines = [
      data.contact + " from " + data.company + " requested the " + data.plan + " plan.",
      "",
      "Company: " + data.company,
      "Contact: " + data.contact,
      "Work email: " + data.email,
      "Phone: " + (data.phone || "—"),
      "Headcount: " + (data.headcount || "—"),
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

    if (!data.company || !data.contact || !data.email || !data.plan) {
      setStatus(
        lang === "lv"
          ? "Aizpildi uzņēmumu, kontaktu, e-pastu un plānu."
          : "Please fill company, contact, email and plan.",
        "is-err"
      );
      return;
    }

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
