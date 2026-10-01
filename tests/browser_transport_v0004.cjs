// Deterministic local coverage of the additive v0004 transport contract.
// BASE_URL=http://127.0.0.1:18099 LOCAL_ONLY=1 node tests/browser_transport_v0004.cjs
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:18099';
const localOnly = process.env.LOCAL_ONLY === '1';
assert.ok(localOnly, 'Run this mocked test with LOCAL_ONLY=1');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Local server required');

const stop = (id, name) => ({id, name, lat:56.95, lon:24.1, source_id:'riga'});
const places = {places:[
  {kind:'stop_group', ...stop('group:central', 'Centrālā stacija'), source_id:null, stop_count:6, member_ids:['riga:1', 'riga:2', 'riga:3', 'riga:4', 'riga:5', 'riga:6'], modes:['bus', 'tram', 'trolleybus'], area_label:'Rīga', area_name:'Rīga', area_type:'city', municipality_name:null},
  {kind:'stop_group', ...stop('group:terminal', 'Autoosta'), source_id:null, stop_count:21, member_ids:Array.from({length:21}, (_, i) => `riga:${i + 10}`), modes:['bus', 'other', 'constructor']},
  {kind:'stop', ...stop('riga:babite', 'Babītes stacija'), stop_count:1, modes:['train'], area_label:'Babīte, Mārupes nov.', area_name:'Babīte', area_type:'village', municipality_name:'Mārupes nov.'},
  {kind:'locality', id:'locality:babite', name:'Babīte', locality_code:'babite', locality_type:'village', municipality_name:'Mārupes nov.', source_id:'vzd', stop_count:4, modes:['bus', 'carpool']},
  {kind:'city', id:'city:riga', name:'Rīga', stop_count:100, modes:['train', 'bus'], source_id:null},
  {kind:'stop', id:'legacy:stop', name:'Vecā pietura', stop_count:1, modes:['bus'], source_id:'atd'},
  {kind:'locality', id:'locality:parish', name:'Babītes pagasts', locality_code:'parish', locality_type:'parish', municipality_name:'Mārupes nov.', source_id:'vzd', stop_count:8, modes:['bus']},
  {kind:'locality', id:'locality:municipality', name:'Mārupes nov.', locality_code:'municipality', locality_type:'municipality', municipality_name:'Mārupes nov.', source_id:'vzd', stop_count:12, modes:['bus', 'carpool']},
]};
const iso = time => `2035-10-02T${time}:00+03:00`;
const origin = stop('place:origin', 'Sākuma vieta'), platform = stop('riga:1', 'Pirmā pietura');
const transferA = stop('riga:2', 'Pārsēšanās A'), transferB = stop('riga:3', 'Pārsēšanās B');
const endPlatform = stop('riga:4', 'Pēdējā pietura'), destination = stop('place:destination', 'Galamērķa vieta');
const walk = (from_stop, to_stop, departure, arrival, duration_minutes) => ({kind:'walk', from_stop, to_stop, departure:iso(departure), arrival:iso(arrival), duration_minutes, distance_m:200, straight_line_distance_m:150, estimated:true});
const ride = (from_stop, to_stop, departure, arrival, route_short_name, transfer_wait_minutes) => ({kind:'ride', mode:'bus', source_id:'riga', from_stop, to_stop, departure:iso(departure), arrival:iso(arrival), route_short_name, duration_minutes:20, ...(transfer_wait_minutes === undefined ? {} : {transfer_wait_minutes})});
const journey = {
  departure:iso('08:00'), arrival:iso('08:55'), duration_minutes:55, transfer_count:1,
  from_stop:origin, to_stop:destination,
  legs:[{...walk(origin, platform, '08:00', '08:03', 3), arrival:'2035-10-02T08:03:20+03:00'}, ride(platform, transferA, '08:08', '08:28', '1'), walk(transferA, transferB, '08:28', '08:31', 3), ride(transferB, endPlatform, '08:32', '08:52', '2', 1), walk(endPlatform, destination, '08:52', '08:55', 3)],
};
const result = (exhaustive = false) => ({journeys:[journey], carpool_offers:[], provider_status:{shurp:{status:'ok'}}, search_limits:{exhaustive, searched_until:iso('18:07'), endpoint_walk_m:400}});
const copy = {
  lv:{stop:'Pietura', stops:'6 pieturvietas', twentyOne:'21 pieturvieta', village:'Ciems', city:'Pilsēta', parish:'Pagasts', municipality:'Novads', locality:'Apdzīvota vieta', carpool:'Kopbraukšana', bus:'Autobuss', train:'Vilciens', other:'Cits', to:'Iešana līdz pieturai', transfer:'Aptuvena iešana', from:'Iešana no pieturas', wait:'Gaidīšana: 5 min', busy:'Pakalpojums ir noslogots — mēģinām vēlreiz…', final:'Pakalpojums pašlaik ir noslogots. Mēģini vēlreiz pēc brīža.', failed:'Transporta dati pašlaik nav pieejami.', note:'Rādīti maršruti ar atiešanu līdz plkst. 18:07.'},
  en:{stop:'Stop', stops:'6 stops', twentyOne:'21 stops', village:'Village', city:'City', parish:'Parish', municipality:'Municipality', locality:'Locality', carpool:'Carpooling', bus:'Bus', train:'Train', other:'Other', to:'Walk to the stop', transfer:'Estimated walk', from:'Walk from the stop', wait:'Waiting: 5 min', busy:'The service is busy — trying again…', final:'The service is busy right now. Please try again in a moment.', failed:'Transport data is currently unavailable.', note:'Showing journeys departing until 18:07.'},
};

async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({width:document.documentElement.clientWidth, scroll:document.documentElement.scrollWidth}));
  assert.ok(dimensions.scroll <= dimensions.width, `${label}: horizontal overflow ${JSON.stringify(dimensions)}`);
}
async function textEquals(page, selector, expected) {
  await page.waitForFunction(({selector, expected}) => document.querySelector(selector)?.textContent === expected, {selector, expected});
}

(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    for (const lang of ['lv', 'en']) for (const width of [390, 1440]) {
      const t = copy[lang];
      const context = await browser.newContext({viewport:{width, height:900}, timezoneId:'America/Los_Angeles', reducedMotion:'reduce'});
      const page = await context.newPage(), errors = [], calls = [], unexpected = [];
      let replies = [], journeyCalls = [], placeFixture = places, placeStatus = 200;
      page.on('pageerror', error => errors.push(error.message));
      // Existing font links are irrelevant to the test and must not use network.
      await page.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
      await page.route('**/api/transport/**', async route => {
        const url = new URL(route.request().url()), resource = url.pathname.split('/').pop();
        calls.push(url);
        let status = 200, headers = {}, body = {};
        if (resource === 'places') { body = placeFixture; status = placeStatus; }
        else if (resource === 'journeys') {
          journeyCalls.push(url.href);
          const reply = replies.shift();
          if (!reply) unexpected.push('Unplanned journeys call');
          ({status = 200, headers = {}, body = result()} = reply || {});
        } else unexpected.push(resource);
        await route.fulfill({status, headers, contentType:'application/json', body:JSON.stringify(body)});
      });
      const response = await page.goto(`${base}/${lang}/transport`, {waitUntil:'domcontentloaded'});
      assert.equal(response.status(), 200);
      await page.waitForFunction(() => Boolean(window.ShurpPlannerInputs));
      await page.evaluate(() => {
        const summary = document.querySelector('#summary');
        window.summaryWasBusy = summary.getAttribute('aria-busy') === 'true';
        new MutationObserver(records => {
          if (summary.getAttribute('aria-busy') === 'true' || records.some(record => record.oldValue === 'true')) window.summaryWasBusy = true;
        }).observe(summary, {attributes:true, attributeFilter:['aria-busy'], attributeOldValue:true});
      });
      await page.locator('#date').fill('02.10.2035');
      await page.locator('#time').fill('08:00');

      await page.locator('#from').fill('Ri');
      await page.locator('#from-option-7').waitFor({state:'visible'});
      const options = page.locator('#from-list [role=option]');
      assert.equal(await options.count(), 8);
      const secondary = await page.locator('#from-list small').allTextContents();
      assert.deepEqual(secondary, [`Rīga · ${t.stop} · ${t.stops}`, `${t.stop} · ${t.twentyOne}`, `Babīte, Mārupes nov. · ${t.stop}`, `Mārupes nov. · ${t.village}`, t.city, t.stop, `Mārupes nov. · ${t.parish}`, t.municipality]);
      assert.deepEqual(await options.nth(1).locator('.mode-badge').allTextContents(), [t.bus, t.other]);
      assert.deepEqual(await options.nth(2).locator('.mode-badge').allTextContents(), [t.train]);
      assert.deepEqual(await options.nth(3).locator('.mode-badge').allTextContents(), [t.bus, t.carpool]);
      await page.getByRole('option', {name:new RegExp(`Centrālā stacija.*Rīga.*${t.stops}`)}).waitFor({state:'visible'});
      assert.equal(await page.locator('#from').getAttribute('aria-expanded'), 'true');
      await noOverflow(page, `${lang}/${width} suggestions`);
      const listSize = await page.locator('#from-list').evaluate(list => ({height:list.clientHeight, scrollHeight:list.scrollHeight, viewportHeight:window.innerHeight}));
      assert.ok(listSize.height <= Math.min(320, listSize.viewportHeight * 0.4));
      assert.ok(listSize.scrollHeight > listSize.height, 'Tall suggestions must scroll');
      // Exercise keyboard selection with the richer accessible option text.
      await page.locator('#from').press('ArrowDown');
      assert.equal(await page.locator('#from').getAttribute('aria-activedescendant'), 'from-option-0');
      for (let index = 1; index < 8; index++) await page.locator('#from').press('ArrowDown');
      assert.equal(await page.locator('#from').getAttribute('aria-activedescendant'), 'from-option-7');
      const activeBounds = await page.locator('#from-option-7').evaluate(option => {
        const bounds = option.getBoundingClientRect(), list = option.closest('.suggestions');
        const container = list.getBoundingClientRect();
        return {top:bounds.top, bottom:bounds.bottom, listTop:container.top, listBottom:container.bottom, scrollTop:list.scrollTop};
      });
      assert.ok(activeBounds.scrollTop > 0, 'Keyboard selection scrolls the list');
      assert.ok(activeBounds.top >= activeBounds.listTop && activeBounds.bottom <= activeBounds.listBottom, 'Active option remains in view');
      await page.locator('#from-option-7').hover();
      const chipStyle = await page.locator('#from-option-7 .mode-badge').first().evaluate(chip => {
        const style = getComputedStyle(chip);
        return {borderWidth:parseFloat(style.borderTopWidth), borderStyle:style.borderTopStyle, borderColor:style.borderTopColor, background:style.backgroundColor};
      });
      assert.ok(chipStyle.borderWidth > 0 && chipStyle.borderStyle !== 'none' && chipStyle.borderColor !== chipStyle.background, 'Hovered/selected chips have a visible boundary');
      await page.locator('#from').press('ArrowDown');
      await page.locator('#from').press('Enter');
      await page.locator('#to').fill('Ba');
      await page.locator('#to-option-3').waitFor({state:'visible'});
      await page.locator('#to-option-3').click();
      assert.equal(await page.locator('#to').inputValue(), 'Babīte');

      const submit = async sequence => {
        replies = [...sequence]; journeyCalls = [];
        await page.evaluate(() => document.querySelector('#planner').requestSubmit());
      };
      const done = async () => {
        await page.waitForFunction(() => document.querySelector('#result-list').getAttribute('aria-busy') === 'false');
        assert.equal(await page.locator('#summary').getAttribute('aria-busy'), null);
      };
      const busyVisible = async () => {
        await textEquals(page, '#summary', t.busy);
        assert.equal(await page.locator('#summary').getAttribute('aria-busy'), null);
        assert.equal(await page.locator('#result-list').getAttribute('aria-busy'), 'true');
        assert.ok(await page.locator('#summary').isVisible());
        await noOverflow(page, `${lang}/${width} busy`);
      };
      await submit([{body:result()}]); await done();
      assert.equal(await page.locator('.search-limit-note').textContent(), t.note);
      assert.deepEqual(await page.locator('.transit-main .time small').allTextContents(), [origin.name, destination.name]);
      await page.locator('.transit-main').click();
      assert.deepEqual(await page.locator('.walk strong').allTextContents(), [t.to, t.transfer, t.from]);
      const walks = await page.locator('.walk').allTextContents();
      const estimate = lang === 'lv' ? 'aptuveni' : 'about';
      assert.equal(walks[0], `${t.to} · ${estimate} 200 m · 3 min${origin.name} → ${platform.name}`);
      assert.equal(walks[1], `${t.transfer} · 200 m · 3 min${transferA.name} → ${transferB.name}`);
      assert.equal(walks[2], `${t.from} · ${estimate} 200 m · 3 min${endPlatform.name} → ${destination.name}`);
      assert.deepEqual(await page.locator('.transfer').allTextContents(), [t.wait, lang === 'lv' ? 'Gaidīšana: 1 min' : 'Waiting: 1 min']);
      await noOverflow(page, `${lang}/${width} note and walk results`);
      await submit([{body:result(true)}]); await done();
      assert.equal(await page.locator('.search-limit-note').count(), 0);
      await submit([{body:{...result(), search_limits:{exhaustive:false}}}]); await done();
      assert.equal(await page.locator('.search-limit-note').count(), 0);
      const older = {journeys:[{...journey, legs:[ride(platform, endPlatform, '08:08', '08:28', '1')]}], carpool_offers:[]};
      await submit([{body:older}]); await done();
      assert.equal(await page.locator('.search-limit-note').count(), 0);
      assert.equal(await page.locator('.card').count(), 1);
      await submit([{body:{...older, journeys:[{...older.journeys[0], legs:[{...older.journeys[0].legs[0], mode:'constructor'}]}]}}]); await done();
      assert.equal(await page.locator('.card .mode-badge').count(), 0, 'Unknown ride modes produce no chip');
      assert.ok(!(await page.locator('.card').textContent()).includes('function Object'));

      const busy = {status:503, headers:{'Retry-After':'1'}, body:{error:'busy'}};
      await submit([busy, {body:result()}]); await busyVisible(); await done();
      assert.equal(journeyCalls.length, 2);
      assert.equal(journeyCalls[0], journeyCalls[1], 'Retry must preserve the exact request');
      assert.equal(await page.locator('.card').count(), 1);
      assert.equal(await page.locator('.search-limit-note').textContent(), t.note);
      await noOverflow(page, `${lang}/${width} retry results`);
      await submit([busy, busy]); await busyVisible(); await done();
      assert.equal(await page.locator('#summary').textContent(), t.final);
      assert.equal(journeyCalls.length, 2);
      assert.equal(await page.locator('.card').count(), 0);
      await noOverflow(page, `${lang}/${width} final busy`);
      for (const failure of [
        {status:503}, {status:502}, {status:429, headers:{'Retry-After':'1'}},
        ...['0', '3601', '1.5', '-1', 'Fri, 02 Oct 2035 18:00:00 GMT'].map(value => ({status:503, headers:{'Retry-After':value}})),
      ]) {
        await submit([{...failure, body:{error:'unavailable'}}]); await done();
        assert.equal(await page.locator('#summary').textContent(), t.failed);
        assert.equal(journeyCalls.length, 1);
      }
      // Start a distinct search while the first request is waiting to retry.
      await submit([busy]); await busyVisible();
      replies = [{body:{...result(true), journeys:[{...journey, from_stop:{...origin, name:'Jaunā meklēšana'}}]}}];
      await page.locator('#time').fill('09:00');
      await page.evaluate(() => document.querySelector('#planner').requestSubmit());
      await done();
      await page.waitForTimeout(1200); // Beyond Retry-After: old timer must be cancelled.
      assert.equal(journeyCalls.length, 2, 'Only original and new search, no stale retry');
      assert.equal(new URL(journeyCalls[1]).searchParams.get('time'), '09:00');
      assert.equal(await page.locator('.transit-main .time small').first().textContent(), 'Jaunā meklēšana');
      assert.equal(await page.locator('.search-limit-note').count(), 0);
      assert.equal(await page.locator('#result-list').getAttribute('aria-busy'), 'false');

      // A rejected submit also cancels the pending retry and protects its message.
      await submit([busy]); await busyVisible();
      await page.locator('#time').fill('invalid');
      await page.evaluate(() => document.querySelector('#planner').requestSubmit());
      await done();
      const invalid = lang === 'lv' ? 'Pārbaudi brauciena datumu un laiku.' : 'Check the journey date and time.';
      assert.equal(await page.locator('#summary').textContent(), invalid);
      await page.waitForTimeout(1200);
      assert.equal(journeyCalls.length, 1, 'Invalid input cancels busy retry');
      assert.equal(await page.locator('#summary').textContent(), invalid);
      assert.equal(await page.locator('.card').count(), 0);

      // Absent modes/area/type, locality-city mapping, duplicate labels and 11 plural.
      placeFixture = {places:[
        {kind:'locality', id:'locality:legacy', name:'Vecā vieta'},
        {kind:'locality', id:'locality:city', name:'Mazpilsēta', locality_type:'city', municipality_name:t.city},
        {kind:'stop_group', id:'group:eleven', name:'Vienpadsmit', stop_count:11},
        {kind:'stop_group', id:'group:one', name:'Viens', stop_count:1},
        {kind:'locality', id:'locality:unknown', name:'Nezināms tips', locality_type:'hamlet', modes:['constructor', 'unrecognized']},
      ]};
      await page.locator('#from').fill('Ve');
      await page.locator('#from-option-3').waitFor({state:'visible'});
      assert.deepEqual(await page.locator('#from-list small').allTextContents(), [t.locality, t.city, `${t.stop} · ${lang === 'lv' ? '11 pieturvietas' : '11 stops'}`, t.stop, t.locality]);
      assert.equal(await page.locator('#from-list .mode-badge').count(), 0);
      await noOverflow(page, `${lang}/${width} older suggestions`);
      placeStatus = 503;
      await page.locator('#from').fill('error');
      await page.waitForResponse(response => response.url().includes('/places?') && response.status() === 503);
      await page.locator('#from-list').waitFor({state:'hidden'});

      for (const url of calls) {
        const resource = url.pathname.split('/').pop();
        assert.deepEqual([...url.searchParams.keys()].sort(), resource === 'places' ? ['limit', 'q', 'role'] : ['date', 'from', 'max_transfers', 'mode', 'time', 'to']);
        if (resource === 'places') { assert.equal(url.searchParams.get('limit'), '8'); assert.ok(['origin', 'destination'].includes(url.searchParams.get('role'))); }
      }
      assert.equal(calls.find(url => url.searchParams.get('q') === 'Ri').searchParams.get('role'), 'origin');
      assert.equal(calls.find(url => url.searchParams.get('q') === 'Ba').searchParams.get('role'), 'destination');
      assert.deepEqual(unexpected, [], 'Every API request must have a planned fixture');
      assert.equal(await page.evaluate(() => window.summaryWasBusy), false, 'The live status region must never be aria-busy');
      assert.equal(await page.locator('#summary').getAttribute('aria-busy'), null);
      assert.deepEqual(errors, [], 'No pageerror');
      console.log(`v0004 planner OK: ${lang}, ${width}px`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
