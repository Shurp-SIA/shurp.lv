(() => {
  "use strict";

  const pad = value => String(value).padStart(2, "0");
  const rigaParts = () => Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Riga", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  const validDate = (year, month, day) => {
    if (!Number.isInteger(year) || year < 1000 || year > 9999) return false;
    const value = new Date(Date.UTC(year, month - 1, day));
    return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day;
  };
  const iso = (year, month, day) => `${year}-${pad(month)}-${pad(day)}`;
  const displayDate = value => {
    const match = String(value || "").match(/^(\d{4})-(\d\d)-(\d\d)$/);
    return match ? `${match[3]}.${match[2]}.${match[1]}` : "";
  };

  function init() {
    const date = document.querySelector("#date"), dateOpen = document.querySelector("#date-open"), datePicker = document.querySelector("#date-picker");
    const time = document.querySelector("#time"), timeOpen = document.querySelector("#time-open"), dialog = document.querySelector("#time-picker");
    const hour = document.querySelector("#time-hour"), minute = document.querySelector("#time-minute"), apply = document.querySelector("#time-apply"), cancel = document.querySelector("#time-cancel");
    if (!date || !time) return;

    const now = rigaParts();
    const messages = document.body.dataset.lang === "lv" ? {date: "Ievadi derīgu datumu", time: "Ievadi derīgu laiku"} : {date: "Enter a valid date", time: "Enter a valid time"};
    let selectedDate = iso(Number(now.year), Number(now.month), Number(now.day));
    let restoreFocus = null;
    let pickerCommitValue = null;
    const setDate = value => {
      selectedDate = value;
      date.value = displayDate(value);
      if (datePicker) datePicker.value = value;
      date.setCustomValidity("");
    };
    const parseDate = value => {
      const text = String(value || "").trim();
      let year, month, day, match;
      if ((match = text.match(/^(\d{4})-(\d\d)-(\d\d)$/))) [, year, month, day] = match;
      else if ((match = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/))) [, day, month, year] = match;
      else if ((match = text.match(/^(\d{8})$/))) { day = match[1].slice(0, 2); month = match[1].slice(2, 4); year = match[1].slice(4); }
      else if ((match = text.match(/^(\d{1,2})[./](\d{1,2})[./]?$/))) { day = match[1]; month = match[2]; year = selectedDate.slice(0, 4); }
      else if ((match = text.match(/^(\d{1,2})$/))) { day = match[1]; month = selectedDate.slice(5, 7); year = selectedDate.slice(0, 4); }
      else return null;
      const parsed = [Number(year), Number(month), Number(day)];
      return validDate(...parsed) ? iso(...parsed) : null;
    };
    const parseTime = value => {
      const text = String(value || "").trim();
      let hours, minutes, match;
      if ((match = text.match(/^(\d{1,2})[.:](\d\d)$/))) [, hours, minutes] = match;
      else if ((match = text.match(/^(\d{3,4})$/))) { hours = match[1].slice(0, -2); minutes = match[1].slice(-2); }
      else if ((match = text.match(/^(\d{1,2})$/))) { hours = match[1]; minutes = "0"; }
      else return null;
      const hourNumber = Number(hours), minuteNumber = Number(minutes);
      return hourNumber >= 0 && hourNumber <= 23 && minuteNumber >= 0 && minuteNumber <= 59 ? `${pad(hourNumber)}:${pad(minuteNumber)}` : null;
    };
    const normalizeDate = () => {
      if (!date.value.trim()) return null;
      const value = parseDate(date.value);
      if (!value) { date.setCustomValidity(messages.date); return null; }
      setDate(value); return value;
    };
    const normalizeTime = () => {
      if (!time.value.trim()) return null;
      const value = parseTime(time.value);
      if (!value) { time.setCustomValidity(messages.time); return null; }
      time.value = value; time.setCustomValidity(""); return value;
    };
    const read = () => {
      const dateValue = normalizeDate(), timeValue = normalizeTime();
      return dateValue && timeValue ? {date: dateValue, time: timeValue} : null;
    };
    const fillSelect = (select, max) => {
      if (!select || select.options.length) return;
      for (let value = 0; value <= max; value += 1) {
        const option = document.createElement("option"); option.value = pad(value); option.textContent = pad(value); select.append(option);
      }
    };
    const closeDialog = () => {
      if (!dialog) return;
      if (typeof dialog.close === "function" && dialog.open) dialog.close(); else dialog.hidden = true;
      restoreFocus?.focus(); restoreFocus = null;
    };
    const restoreDateFocus = () => {
      if (datePicker) datePicker.blur();
      const focus = () => {
        const active = document.activeElement;
        if (active && active !== document.body && active !== datePicker) return;
        const target = dateOpen || date; try { target.focus({preventScroll: true}); } catch (_) { target.focus(); }
      };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(focus)); else setTimeout(focus, 0);
    };
    const openDialog = () => {
      if (!dialog || !hour || !minute) return;
      fillSelect(hour, 23); fillSelect(minute, 59);
      const value = parseTime(time.value) || `${now.hour}:${now.minute}`;
      hour.value = value.slice(0, 2); minute.value = value.slice(3, 5); restoreFocus = timeOpen || time;
      if (typeof dialog.showModal === "function") { if (!dialog.open) dialog.showModal(); } else dialog.hidden = false;
      hour.focus();
    };

    setDate(selectedDate); time.value = `${now.hour}:${now.minute}`;
    date.addEventListener("input", () => {
      date.setCustomValidity("");
      if (/^\d{8}$/.test(date.value) || /^\d{4}-\d\d-\d\d$/.test(date.value) || /^\d{1,2}[./]\d{1,2}[./]\d{4}$/.test(date.value)) normalizeDate();
    });
    time.addEventListener("input", () => {
      time.setCustomValidity("");
      if (/^\d{4}$/.test(time.value) || /^\d{1,2}[.:]\d\d$/.test(time.value)) normalizeTime();
    });
    [date, time].forEach(input => input.addEventListener("blur", input === date ? normalizeDate : normalizeTime));
    [date, time].forEach(input => input.addEventListener("keydown", event => { if (event.key === "Enter") (input === date ? normalizeDate : normalizeTime)(); }));
    const commitPickerDate = () => {
      if (!datePicker || !/^\d{4}-\d\d-\d\d$/.test(datePicker.value) || pickerCommitValue === datePicker.value) return;
      pickerCommitValue = datePicker.value; datePicker.classList.remove("picker-fallback"); setDate(datePicker.value); restoreDateFocus();
    };
    datePicker?.addEventListener("input", commitPickerDate);
    datePicker?.addEventListener("change", commitPickerDate);
    dateOpen?.addEventListener("click", () => {
      if (!datePicker) return;
      pickerCommitValue = null;
      // On Safari the native picker is tied to the focused date control.  The
      // launch button keeps focus by default, so move it first; the later blur
      // in restoreDateFocus can then dismiss the native popover after a date
      // selection.
      try { datePicker.focus({preventScroll: true}); } catch (_) { datePicker.focus(); }
      try { datePicker.showPicker(); } catch (_) { datePicker.classList.add("picker-fallback"); datePicker.focus(); }
    });
    timeOpen?.addEventListener("click", openDialog);
    apply?.addEventListener("click", () => { if (hour && minute) { time.value = `${hour.value}:${minute.value}`; time.setCustomValidity(""); } closeDialog(); });
    cancel?.addEventListener("click", closeDialog);
    dialog?.addEventListener("cancel", () => { setTimeout(closeDialog, 0); });
    dialog?.addEventListener("keydown", event => { if (event.key === "Escape" && !dialog.open) { event.preventDefault(); closeDialog(); } });
    window.ShurpPlannerInputs = {read};
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once:true}); else init();
})();
