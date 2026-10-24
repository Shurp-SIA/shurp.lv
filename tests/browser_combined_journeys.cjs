const assert = require('node:assert/strict');
const {chromium} = require('playwright');

const base = process.env.BASE_URL || 'http://127.0.0.1:18099';
const at = time => `2026-10-26T${time}:00+02:00`;
const stop = (id, name) => ({id: `vivi:${id}`, name, lat: 56.947, lon: 24.12, source_id: 'vivi'});
const riga = stop('riga', 'Rīga'), saulkrasti = stop('saulkrasti', 'Saulkrasti');
const offer = {
  id: '00000000-0000-0000-0000-000000000001', departure: '2026-10-26T07:00:00+00:00',
  arrival: '2026-10-26T07:29:00+00:00', duration_minutes: 29, seats_available: 2,
  price_minor: 300, currency: 'EUR', cached_at: '2026-10-23T00:00:00+00:00',
  origin: {name: 'Lapsas', locality_code: '100207886'}, destination: {name: 'Rīga', locality_code: '100003003'},
  match_kind: 'city', store_links: {android: 'https://play.google.com/store/apps/details?id=lv.shurp.app', ios: 'https://apps.apple.com/lv/app/shurp/id6760924489'},
};
const ride = {
  kind: 'ride', id: 'vivi:train:2026-10-26:0:1', trip_id: 'vivi:train', departure: at('09:45'),
  arrival: at('10:46'), duration_minutes: 61, route_name: 'vivi:train', route_short_name: 'vivi:train',
  mode: 'train', operator: 'vivi', from_stop: riga, to_stop: saulkrasti, source_id: 'vivi',
  stops: [{...riga, departure: at('09:45')}, {...saulkrasti, arrival: at('10:46')}],
  service_date: '2026-10-26', booking_required: false,
};
const carpoolLeg = {kind: 'carpool', departure: at('09:00'), arrival: at('09:29'), from_name: 'Lapsas', to_name: 'Rīga', offer_id: offer.id};
const transfer = {kind: 'carpool_transfer', walk_minutes: 5, stop_name: 'Rīga', stop_id: riga.id};
const first = {
  id: `cj:${offer.id}:carpool_first:${ride.id}:${ride.departure}`, type: 'carpool_first', guaranteed: false,
  departure: at('09:00'), arrival: at('10:46'), duration_minutes: 106, transfer_count: 1,
  connection_wait_minutes: 15, carpool: offer, legs: [carpoolLeg, transfer, ride],
};
const lastOffer = {...offer, departure: '2026-10-26T09:00:00+00:00', arrival: '2026-10-26T09:29:00+00:00', origin: {name: 'Saulkrasti', locality_code: '100003004'}, destination: {name: 'Lapsas', locality_code: '100207886'}};
const walk = {kind: 'walk', from_stop: stop('access', 'Saulkrastu pieeja'), to_stop: saulkrasti, distance_m: 100, duration_minutes: 2, departure: at('10:46'), arrival: at('10:48')};
const last = {
  ...first, id: `cj:${offer.id}:carpool_last:${ride.id}:${ride.departure}`, type: 'carpool_last',
  departure: at('09:45'), arrival: at('11:29'), duration_minutes: 104, carpool: lastOffer,
  legs: [ride, walk, {...transfer, stop_name: 'Saulkrasti', stop_id: saulkrasti.id}, {...carpoolLeg, departure: at('11:00'), arrival: at('11:29'), from_name: 'Saulkrasti', to_name: 'Lapsas'}],
};
const fixture = {
  journeys: [{...ride, legs: [ride], transfer_count: 0}], carpool_offers: [offer],
  provider_status: {shurp: {status: 'ok', combined: 'ok'}, vivi: {status: 'ok'}},
  combined_journeys: [first, last],
};

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    for (const lang of ['lv', 'en']) for (const width of [390, 1440]) {
      const page = await browser.newPage({viewport: {width, height: 900}, reducedMotion: 'reduce'});
      const errors = [], calls = [];
      let response = structuredClone(fixture);
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/transport/**', async route => {
        const resource = new URL(route.request().url()).pathname.split('/').pop();
        calls.push(resource);
        const body = resource === 'journeys' ? response
          : resource === 'tickets' ? {match: 'search', url: 'https://www.bezrindas.lv/lv/vilcienu-biletes'}
          : resource === 'places' ? {places: [{id: 'city:riga', name: 'Rīga', kind: 'city'}, {id: 'city:saulkrasti', name: 'Saulkrasti', kind: 'city'}]} : {};
        await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(body)});
      });
      assert.equal((await page.goto(`${base}/${lang}/transport`)).status(), 200);
      await page.waitForFunction(() => Boolean(window.ShurpPlannerInputs));
      const search = async mode => {
        const result = page.waitForResponse(item => item.url().includes('/api/transport/journeys?'));
        if (mode) {
          await page.locator(`input[name="mode"][value="${mode}"]`).check({force: true});
          await page.locator('button.search').click();
        } else await page.locator('.route-shortcut').first().click();
        await result;
        await page.waitForFunction(() => document.querySelector('#result-list').getAttribute('aria-busy') === 'false' && document.querySelector('#result-list .group'));
      };
      const overflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${lang}/${width}: horizontal overflow`);
      await search();
      const heading = lang === 'lv' ? 'Kopbraukšana + sabiedriskais transports' : 'Carpool + public transport';
      assert.deepEqual(await page.locator('#result-list .group > h3').allTextContents(), [lang === 'lv' ? 'Kopbraukšana' : 'Carpooling', heading, lang === 'lv' ? 'Sabiedriskais transports' : 'Public transport']);
      const group = page.locator('#result-list .group').nth(1), cards = group.locator('article.card');
      assert.equal(await cards.count(), 2);
      const warning = lang === 'lv' ? 'Savienojums nav garantēts – vietu apstipriniet Shurp lietotnē' : 'Connection not guaranteed – confirm your seat in the Shurp app';
      const reserve = lang === 'lv' ? 'Rezervēt vietu' : 'Reserve a seat';
      const existingLink = page.locator('#result-list .group').first().locator('.carpool-cta');
      assert.equal(await existingLink.count(), 1);
      assert.ok(await existingLink.isVisible());
      assert.equal(await existingLink.getAttribute('href'), 'https://shurp.lv/get');
      assert.equal(await page.locator('#result-list .group').last().locator('.carpool-cta').count(), 0);
      for (let i = 0; i < 2; i++) {
        const card = cards.nth(i);
        assert.equal(await card.locator('[role="note"]').innerText(), warning);
        assert.ok(await card.locator('[role="note"]').isVisible());
        const caution = card.locator('.connection-warning[role="note"]');
        assert.equal(await caution.count(), 1);
        const bounds = await card.boundingBox(), inset = await caution.boundingBox();
        assert.ok(inset.x >= bounds.x + 18 && inset.x + inset.width <= bounds.x + bounds.width - 18, 'warning must be inset by the card padding');
        assert.ok(inset.y > bounds.y && inset.y + inset.height < bounds.y + bounds.height);
        assert.deepEqual(await caution.evaluate(el => {
          const style = getComputedStyle(el);
          return {align: style.textAlign, borders: [style.borderTopStyle, style.borderRightStyle, style.borderBottomStyle, style.borderLeftStyle]};
        }), {align: 'left', borders: ['none', 'none', 'none', 'solid']});
        assert.equal(await card.locator('.transit-main').getAttribute('aria-expanded'), 'false');
        const shurpBadge = page.locator('#result-list .group').first().locator('.carpool-main > .badge');
        assert.equal(await card.locator('.transit-main .mode-list .badge').getAttribute('class'), await shurpBadge.getAttribute('class'));
        const badge = await shurpBadge.innerText(), train = lang === 'lv' ? 'Vilciens' : 'Train';
        assert.deepEqual(await card.locator('.transit-main .mode-list > span').allTextContents(), i ? [train, badge] : [badge, train]);
        await overflow();
        assert.equal(await card.locator('.carpool-cta').count(), 2);
        assert.equal(await card.locator('.carpool-cta:not(.ticket-bar .carpool-ticket-row .carpool-cta):not(.leg.carpool .carpool-cta)').count(), 0);
        const shurpRow = card.locator('.ticket-bar .carpool-ticket-row');
        assert.equal(await shurpRow.count(), 1);
        assert.ok(await shurpRow.isVisible(), 'Shurp action must be visible while collapsed');
        assert.deepEqual(await card.locator('.ticket-links > .ticket-item').evaluateAll(els => els.map(el => el.classList.contains('carpool-ticket-row'))), i ? [false, true] : [true, false]);
        assert.equal(await shurpRow.locator(':scope > span').innerText(), i ? 'Shurp · 11:00 Saulkrasti → Lapsas' : 'Shurp · 09:00 Lapsas → Rīga');
        assert.notEqual(await shurpRow.locator(':scope > span').evaluate(el => getComputedStyle(el).color), await card.locator('.ticket-bar .ticket-link').first().evaluate(el => getComputedStyle(el).color), 'Shurp row text must differ from the PT link colour');
        const shurpAction = shurpRow.locator('a.carpool-cta--leg');
        assert.equal(await shurpAction.innerText(), reserve);
        assert.equal(await shurpAction.getAttribute('href'), await existingLink.getAttribute('href'));
        assert.equal(await shurpAction.getAttribute('data-placement'), 'combined-leg');
        const actionBounds = await shurpAction.boundingBox(), rowBounds = await shurpRow.boundingBox();
        assert.ok(actionBounds.height >= 44);
        assert.ok(actionBounds.width < rowBounds.width, 'leg action must be a compact pill');
        assert.deepEqual(await card.locator('.ticket-bar [data-ticket-identity]').allTextContents(), ['1 · 09:45 Rīga → Saulkrasti']);
        assert.deepEqual(await card.locator('.line .time strong').allTextContents(), i ? ['09:45', '11:29'] : ['09:00', '10:46']);
        assert.match(await card.locator('.meta').innerText(), new RegExp(`${i ? '1 h 44 min' : '1 h 46 min'} · 1 ${lang === 'lv' ? 'pārsēšanās' : 'transfers'}`));
        await card.locator('.transit-main').click();
        const rows = card.locator('.details > section');
        assert.deepEqual(await rows.evaluateAll(els => els.map(el => el.className)), i ? ['leg', 'walk', 'walk', 'leg carpool'] : ['leg carpool', 'walk', 'leg']);
        const carpool = card.locator('.leg.carpool');
        const legAction = carpool.locator('a.carpool-cta--leg');
        assert.ok(await legAction.isVisible());
        assert.equal(await legAction.innerText(), reserve);
        assert.equal(await legAction.getAttribute('href'), await existingLink.getAttribute('href'));
        assert.equal(await carpool.locator(':scope > :last-child').getAttribute('class'), 'carpool-cta carpool-cta--leg');
        assert.deepEqual(await card.locator('.leg-count').allTextContents(), ['1']);
        assert.ok(await shurpRow.isVisible());
        assert.equal(await carpool.locator('strong.badge').innerText(), lang === 'lv' ? 'Shurp kopbraukšana' : 'Shurp carpool');
        assert.equal(await carpool.locator('p').innerText(), i ? 'Saulkrasti → Lapsas' : 'Lapsas → Rīga');
        assert.equal(await carpool.locator('.journey-summary').innerText(), i ? '11:00–11:29' : '09:00–09:29');
        assert.equal(await carpool.locator('.offer-meta strong').innerText(), await page.locator('.carpool-footer .offer-meta strong').innerText());
        assert.equal(await carpool.locator('.offer-meta > span').innerText(), lang === 'lv' ? '2 brīvas vietas' : '2 seats available');
        assert.equal(await rows.nth(i ? 2 : 1).innerText(), lang === 'lv' ? `~5 min gājiens ${i ? 'no pieturas Saulkrasti' : 'līdz pieturai Rīga'}` : `~5 min walk ${i ? 'from Saulkrasti' : 'to Rīga'}`);
        assert.equal(await card.locator('.ticket-bar [data-ticket-reveal]').count(), 1);
        await overflow();
      }
      // The reused ticket actions resolve inside the combined card only.
      await cards.first().locator('.ticket-bar [data-ticket-reveal]').click();
      await cards.first().locator('.ticket-bar [data-ticket-cta]').waitFor();
      assert.equal(await cards.first().locator('.ticket-bar [data-ticket-cta]').getAttribute('href'), 'https://www.bezrindas.lv/lv/vilcienu-biletes');
      assert.ok(calls.includes('tickets'));
      assert.equal(await page.locator('#result-list .group').last().locator('[data-ticket-reveal]').count(), 2);
      for (const value of [undefined, []]) {
        response = structuredClone(fixture);
        if (value === undefined) delete response.combined_journeys;
        else response.combined_journeys = value;
        await search();
        assert.equal(await page.locator('.combined').count(), 0);
        assert.equal(await page.locator('#result-list .group').count(), 2);
        await overflow();
      }
      response = structuredClone(fixture);
      response.combined_journeys = [first, last, {...first, legs: [carpoolLeg, {kind: 'future_kind', text: 'MUST NOT RENDER'}, transfer, ride]}, last];
      await search();
      assert.equal(await page.locator('.combined').count(), 3);
      const third = page.locator('.combined').nth(2);
      await third.locator('.transit-main').click();
      assert.equal(await third.locator('.details > section').count(), 3);
      assert.ok(!(await third.innerText()).includes('MUST NOT RENDER'));
      assert.equal(await page.locator('.combined [role="note"]').count(), 3);
      await overflow();
      // Leg order wins over the type, PT numbers stay 1..n, and older data
      // without a carpool leg still gets one action using the offer metadata.
      response = structuredClone(fixture);
      response.combined_journeys = [
        {...last, type: 'carpool_first', legs: [ride, {...ride, id: 'second-ride'}, transfer, {...carpoolLeg, departure: at('11:00'), from_name: '', to_name: ''}]},
        {...first, type: 'carpool_last'},
        {...last, legs: [ride]},
      ];
      await search();
      const edgeCards = page.locator('.combined');
      for (let i = 0; i < 3; i++) {
        const card = edgeCards.nth(i), shurpRow = card.locator('.carpool-ticket-row');
        assert.equal(await shurpRow.count(), 1);
        assert.ok(await shurpRow.isVisible());
        assert.deepEqual(await card.locator('.ticket-links > .ticket-item').evaluateAll(els => els.map(el => el.classList.contains('carpool-ticket-row'))), i === 0 ? [false, false, true] : i === 1 ? [true, false] : [false, true]);
        assert.equal(await shurpRow.locator(':scope > span').innerText(), i === 1 ? 'Shurp · 09:00 Lapsas → Rīga' : 'Shurp · 11:00 Saulkrasti → Lapsas');
        const numbers = i === 0 ? ['1', '2'] : ['1'];
        assert.deepEqual(await card.locator('.ticket-bar [data-ticket-identity]').allTextContents(), numbers.map(n => `${n} · 09:45 Rīga → Saulkrasti`));
        await card.locator('.transit-main').click();
        assert.deepEqual(await card.locator('.leg-count').allTextContents(), numbers);
        await overflow();
      }
      // Compare combined-only counts with the established PT-only wording.
      response = {...structuredClone(fixture), carpool_offers: [], combined_journeys: [], journeys: [fixture.journeys[0], fixture.journeys[0]]};
      await search();
      const twoJourneys = await page.locator('#summary').innerText();
      assert.equal(twoJourneys, lang === 'lv' ? '2 reisi' : '2 journeys');
      response = {...structuredClone(fixture), journeys: [], combined_journeys: []};
      await search();
      assert.equal(await page.locator('#result-list .empty').count(), 0);
      response = {...structuredClone(fixture), journeys: [], carpool_offers: []};
      await search();
      assert.equal(await page.locator('#summary').innerText(), twoJourneys);
      assert.equal(await page.locator('#result-list .group').count(), 1);
      assert.equal(await page.locator('#result-list .group > h3').textContent(), heading);
      assert.equal(await page.locator('#result-list .empty').count(), 0);
      assert.equal(await page.locator('.combined').count(), 2);
      await overflow();
      response = structuredClone(fixture);
      for (const mode of ['carpool', 'bus', 'train', 'tram', 'trolleybus']) {
        await search(mode);
        assert.equal(await page.locator('.combined').count(), 0, `${mode}: combined group must be hidden`);
        assert.equal(await page.locator('#summary').innerText(), mode === 'carpool' ? (lang === 'lv' ? '1 kopbraucieni' : '1 carpools') : (lang === 'lv' ? '1 reisi' : '1 journeys'));
        await overflow();
      }
      await search('all');
      assert.equal(await page.locator('.combined').count(), 2);
      assert.equal(await page.locator('#summary').innerText(), lang === 'lv' ? '1 kopbraucieni · 3 reisi' : '1 carpools · 3 journeys');
      await overflow();
      // Both ticket pages share the updated CSS. Exercise their mocked lookup.
      const ticketCalls = calls.filter(resource => resource === 'tickets').length;
      assert.equal((await page.goto(`${base}/${lang}/tickets?trip_id=vivi:train&from_stop_id=vivi:riga&to_stop_id=vivi:saulkrasti&service_date=2026-10-26`)).status(), 200);
      await page.locator('#ticket-action').waitFor({state: 'visible'});
      assert.equal(await page.locator('#ticket-status').innerText(), lang === 'lv' ? 'Precīzu reisu nevarējām apstiprināt. Meklē maršrutu BezRindas vietnē.' : 'We could not confirm the exact departure. Search the route on BezRindas.');
      assert.equal(calls.filter(resource => resource === 'tickets').length, ticketCalls + 1);
      assert.equal(await page.locator('link[href*="transport.css"]').getAttribute('href'), '../assets/css/transport.css?v=20261024');
      assert.equal(await page.locator('.connection-warning').count(), 0);
      await overflow();
      assert.deepEqual(errors, [], `${lang}/${width}: page errors`);
      await page.close();
      console.log(`combined journeys OK: ${lang} ${width}px`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
