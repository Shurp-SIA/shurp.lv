// Regression check for the planner's whole-day search on a future date.
//
//   node tests/browser_future_date_carpool.cjs
//   BASE_URL=http://127.0.0.1:8000 LOCAL_ONLY=1 node tests/browser_future_date_carpool.cjs
//
// The bug: the time field kept the current Riga wall clock after the date
// changed, and the backend only returns rides from the requested moment to the
// end of the chosen day, so an afternoon search for tomorrow lost every
// morning carpool ride and the Shurp block disappeared.
//
//   BASE_URL     origin to test                 (default https://www.shurp.lv)
//   FUTURE_DATE  date to search, dd.mm.yyyy     (default tomorrow in Riga)
//   LOCAL_ONLY   "1" to skip the API assertions (a static local server cannot
//                reach /api/transport/*)        (default "0")
//
// Cloudflare caches /assets/js/*.js for four hours and cannot be purged from
// here, so every request for transport-inputs.js is re-fetched with a
// cache-busting query; without that the browser would run yesterday's file.
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

const base = process.env.BASE_URL || 'https://www.shurp.lv';
const localOnly = (process.env.LOCAL_ONLY ?? '0') === '1';

const pad = value => String(value).padStart(2, '0');
const rigaParts = () => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Riga', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).formatToParts(new Date()).map(part => [part.type, part.value]));

const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

const now = rigaParts();
const today = `${now.day}.${now.month}.${now.year}`;
const tomorrow = (() => {
  const value = new Date(Date.UTC(Number(now.year), Number(now.month) - 1, Number(now.day) + 1));
  return `${pad(value.getUTCDate())}.${pad(value.getUTCMonth() + 1)}.${value.getUTCFullYear()}`;
})();
const future = process.env.FUTURE_DATE || tomorrow;

const pickPlace = async (page, field, {type, expect}) => {
  const input = page.locator(`#${field}`), list = page.locator(`#${field}-list`);
  await input.click();
  await input.fill('');
  await input.pressSequentially(type, {delay: 40});
  await list.locator('button[role="option"]').first().waitFor({state: 'visible', timeout: 20000});
  const city = list.locator('button[role="option"]', {hasText: expect}).first();
  await (await city.count() ? city : list.locator('button[role="option"]').first()).click();
  await list.waitFor({state: 'hidden', timeout: 5000});
  assert.ok((await input.inputValue()).length > 0, `${field}: autocomplete did not fill the input`);
};

const setDate = async (page, value) => {
  const input = page.locator('#date');
  await input.click();
  await input.fill(value);
  await input.blur();
  assert.equal(await input.inputValue(), value, `date field did not accept ${value}`);
};

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const context = await browser.newContext({
      viewport: {width: 1440, height: 900},
      extraHTTPHeaders: {'Cache-Control': 'no-cache', Pragma: 'no-cache'},
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));

    // Bypass the Cloudflare edge copy of the file under test.
    await page.route('**/assets/js/transport-inputs.js*', async route => {
      const url = new URL(route.request().url());
      url.searchParams.set('nocache', String(Date.now()));
      const response = await route.fetch({url: url.toString()});
      await route.fulfill({response});
    });

    const response = await page.goto(`${base}/lv/transport?nocache=${Date.now()}`, {waitUntil: 'domcontentloaded'});
    assert.equal(response.status(), 200, 'planner page did not load');
    await page.locator('#date').waitFor();
    await page.waitForFunction(() => Boolean(window.ShurpPlannerInputs));

    const time = page.locator('#time');
    const startTime = await time.inputValue();
    assert.match(startTime, /^([01]\d|2[0-3]):[0-5]\d$/, 'default time is not a 24-hour clock');
    // The page opens on today, so the initial time is the current Riga clock.
    // Compared to the minute only loosely: the clock can tick over between the
    // node process starting and the page running its own Intl lookup.
    assert.ok(Math.abs(minutes(startTime) - minutes(`${now.hour}:${now.minute}`)) <= 2, `today should start at the current Riga time (~${now.hour}:${now.minute}), got ${startTime}`);

    // --- the fix: a future date searches the whole day -------------------
    await setDate(page, future);
    assert.equal(await time.inputValue(), '00:00', `a future date must reset the time to 00:00, got ${await time.inputValue()}`);

    // --- and today comes back to the current time ------------------------
    await setDate(page, today);
    const restored = await time.inputValue();
    assert.notEqual(restored, '00:00', 'switching back to today left the time at 00:00');
    assert.match(restored, /^([01]\d|2[0-3]):[0-5]\d$/, `restored time is malformed: ${restored}`);

    if (localOnly) {
      assert.deepEqual(errors, [], 'page errors');
      console.log(`time-input behaviour OK (today ${startTime} -> ${future} 00:00 -> today ${restored})`);
      return;
    }

    // --- the search that used to come back empty -------------------------
    await pickPlace(page, 'from', {type: 'Sigulda', expect: 'Sigulda'});
    await pickPlace(page, 'to', {type: 'Rīga', expect: 'Rīga'});
    await setDate(page, future);
    assert.equal(await time.inputValue(), '00:00', 'time drifted off 00:00 before the search');

    const request = page.waitForRequest(item => item.url().includes('/api/transport/journeys?'));
    await page.locator('button.search').click();
    const journeyUrl = new URL((await request).url());
    assert.equal(journeyUrl.searchParams.get('time'), '00:00', `search asked for time=${journeyUrl.searchParams.get('time')}`);

    const carpools = page.locator('#result-list article.card.carpool');
    await carpools.first().waitFor({state: 'visible', timeout: 30000});
    const count = await carpools.count();
    assert.ok(count >= 1, `expected at least one carpool offer, found ${count}`);
    const departures = await page.locator('#result-list article.card.carpool .carpool-main .time strong').allTextContents();

    assert.deepEqual(errors, [], 'page errors');
    console.log(`whole-day search OK: ${future} 00:00 Sigulda -> Rīga returned ${count} carpool offer(s); departures ${departures.filter((_, i) => i % 2 === 0).join(', ')}`);
    console.log(`time input: today ${startTime} -> ${future} 00:00 -> today ${restored}`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
