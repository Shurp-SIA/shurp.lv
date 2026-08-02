---
name: Video FAQ Section
overview: Add a new, crawlable "How Shurp works" video-FAQ section to the homepage (lv/en) built from the 7 tutorial scripts and YouTube Shorts, visually fused with the existing feature-card/phone-frame design; refresh the in-app Help overlays (help.html) with matching videos and updated copy; keep everything responsive on mobile and desktop.
todos:
  - id: lv-index-faq
    content: Add new FAQ/tutorial section + nav link + FAQPage JSON-LD to public/lv/index.html
    status: completed
  - id: en-index-faq
    content: Add matching FAQ/tutorial section + nav link + JSON-LD to public/en/index.html (translated)
    status: completed
  - id: lv-help-videos
    content: Add video facades to relevant overlays + new Sharing overlay + copy refresh in public/lv/help.html
    status: completed
  - id: en-help-videos
    content: Mirror the same updates in public/en/help.html
    status: completed
  - id: responsive-check
    content: Review both pages at mobile/desktop widths for layout issues
    status: completed
  - id: build-css
    content: Run npm run build to regenerate public/assets/css/style.css with any new Tailwind classes
    status: completed
isProject: false
---

# Video FAQ Section (SEO) + In-App Help Refresh

## Video mapping (confirmed by user)
- Kas ir Shurp? → `moDcayN93ao`
- Šoferiem (Drivers) → `WN_r2wIlLv8`
- Pasažieriem (Pax) → `Oo3XkZRLVaE`
- Profils → `OXdvYcBVSxA`
- Vai Shurp ir bezmaksas? → `NZCs-wBUye8`
- Dalies uz 200% (Sharing) → `pkY__nKA330`
- Drošība (Safety) → `jN-qb3nDPMY`

These are vertical YouTube **Shorts** (9:16) — perfect visual match for the site's existing `.phone-frame` / `.phone-shadow` black rounded-rectangle mockups already used in the "Viegls dizains" slideshow. The new video cards will reuse that exact styling so the section feels native to the design, not bolted on.

## Part A — New homepage FAQ section (SEO surface)
Files: [public/lv/index.html](public/lv/index.html), [public/en/index.html](public/en/index.html)

- Insert a new `<section id="faq">` right after the existing `#features` 3-card grid (`Vienkārši Maģiski` / `Zini, ar ko brauc` / `Labi videi`) and before the "Viegls dizains" phone-slideshow section — a natural "pitch → how it works → screenshots" flow. Existing bubbles stay untouched.
- Add a nav link ("Jautājumi" / "FAQ") next to "Kā tas strādā" in both nav bars, anchored to `#faq`.
- 7 accordion rows, one per topic above, styled as rounded warm-white "bubbles" (`feature-card`-style, `rounded-[2.5rem]`/`3rem`) matching the rest of the page:
  - Row header = question (e.g. "Kas ir Shurp?"), click toggles open/closed (first item open by default for content-visible-on-load).
  - Expanded body = two-column on desktop / stacked on mobile: **left** a short, freshly-written (not verbatim transcript) paragraph + bullet list distilling the real key facts from that script (e.g. drivers: post a ride, set recurring days, adjust seats/price or make it free, share via one button, approve requests, chat + WhatsApp, rate after the ride); **right** a small vertical video card reusing the black `phone-shadow`/`phone-frame` wrapper.
  - Each row gets a stable id (`#faq-what-is-shurp`, `#faq-drivers`, `#faq-pax`, `#faq-profile`, `#faq-free`, `#faq-sharing`, `#faq-safety`) so any of them can be deep-linked directly and will auto-open + scroll into view on load (small JS, same pattern as `handleHash()` in help.html).
- Video embed = lightweight "lite YouTube embed" facade for performance/CLS: a poster image (`https://i.ytimg.com/vi/<id>/hqdefault.jpg`) with an inline SVG play button; only on click does it inject a `youtube-nocookie.com/embed/<id>?autoplay=1` iframe. No 7 iframes loaded up front.
- Add a `FAQPage` JSON-LD block (per language) with the 7 Q/A pairs using the distilled written answers, for rich-result eligibility. (Not adding `VideoObject` schema since we don't have real publish dates — can revisit later if wanted.)
- Content will be written fresh in Latvian for `lv/index.html` and translated/localized (matching the tone already used in `en/index.html`, e.g. "Ride with the pack") for `en/index.html` — not a literal dump of the spoken scripts.

## Part B — Refresh in-app Help overlays with video
Files: [public/lv/help.html](public/lv/help.html), [public/en/help.html](public/en/help.html)

- Keep the exact current app-like style/structure (app-bar, `card-group`/`help-row`, full-screen `overlay`, `faq-item` accordions) — no layout redesign, per your ask to "remain same style as in-app".
- Add the same lite-YouTube facade component (styled to the 480px mobile-first container) at the top of the relevant overlays:
  - `overlay-how` ("Kā tas darbojas?") → `moDcayN93ao`
  - `overlay-drive` ("Braukšana ar Shurp") → `WN_r2wIlLv8`
  - `overlay-search` ("Braucienu meklēšana") → `Oo3XkZRLVaE`
  - `overlay-safety` ("Drošība un uzticēšanās") → `jN-qb3nDPMY`
  - `overlay-faq-free` ("Vai Shurp ir bezmaksas?") → `NZCs-wBUye8`
  - `overlay-faq-profile` ("Auto un profila pārvaldība") → prepend general profile guidance + `OXdvYcBVSxA`
- Add a new 5th row "Dalies ar Shurp" (Sharing) to the "Kā lietot Shurp" card group with a new overlay containing the `pkY__nKA330` video + copy from the sharing script (currently no equivalent topic exists).
- Tighten/refresh existing overlay copy so it reflects the real script details more precisely (e.g. recurring rides by weekday, multiple simultaneous passenger requests, WhatsApp coordination at every stage, the 4 concrete safety layers: profile, ratings, document validation via Didit/GDPR, reporting).
- Leave `noindex, nofollow` as-is on these pages (this is the app-embedded support/report surface with a ticket form + Turnstile CAPTCHA) — the new homepage section in Part A is the intended crawlable/SEO surface. Flagging this assumption; easy to flip later if you'd rather index help.html too.

## Part C — Responsiveness & build
- New FAQ section: `flex flex-col md:flex-row` for text+video per row, matching existing responsive conventions in the file.
- Video facades: `aspect-[9/16]` container, `max-width` clamp so it never overflows on small screens.
- Since `public/assets/css/style.css` is compiled Tailwind v4 output (see [package.json](package.json) `npm run build`), any new utility classes used in the HTML will be picked up automatically by Tailwind's content scan — I'll run `npm run build` after edits so `style.css` is regenerated with the new classes baked in.
- Manually sanity-check both pages' HTML structure for mobile (~375px) and desktop (~1440px) breakpoints against existing patterns already proven elsewhere on the page.

## Files touched
- [public/lv/index.html](public/lv/index.html) — new FAQ section, nav link, JSON-LD
- [public/en/index.html](public/en/index.html) — same, English content
- [public/lv/help.html](public/lv/help.html) — video facades in overlays, new Sharing row/overlay, copy refresh
- [public/en/help.html](public/en/help.html) — same, English content
- `public/assets/css/style.css` — regenerated via `npm run build` (not hand-edited)
