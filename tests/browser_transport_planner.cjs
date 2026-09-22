// End-to-end check of the on-site transport planner.
//
//   BASE_URL=https://shurp.lv node tests/browser_transport_planner.cjs
//
// It needs a deployment that serves the .htaccess rewrite (/api/transport/*
// -> /api/transport.php) and that has the client key installed outside the
// webroot, so it cannot pass against a plain local static file server.
//
//   BASE_URL        origin to test           (default http://127.0.0.1:18098)
//   WEBSITE_BASE    expected data-website-base (default https://shurp.lv)
//   EXPECT_NOINDEX  "1" while the pages are unlinked, "0" once published
//                                            (default "1")
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

const base = process.env.BASE_URL || 'http://127.0.0.1:18098';
const websiteBase = process.env.WEBSITE_BASE || 'https://shurp.lv';
const expectNoindex = (process.env.EXPECT_NOINDEX ?? '1') === '1';
const origin = new URL(base).origin;
const places = {from: {type: 'Rīga', expect: 'Rīga'}, to: {type: 'Jelgava', expect: 'Jelgava'}};

const pickPlace = async (page, field, {type, expect}) => {
  const input = page.locator(`#${field}`), list = page.locator(`#${field}-list`);
  await input.click();
  await input.fill('');
  await input.pressSequentially(type, {delay: 40});
  await list.locator('button[role="option"]').first().waitFor({state: 'visible', timeout: 15000});
  const option = list.locator('button[role="option"]', {hasText: expect}).first();
  await (await option.count() ? option : list.locator('button[role="option"]').first()).click();
  await list.waitFor({state: 'hidden', timeout: 5000});
  assert.ok((await input.inputValue()).length > 0, `${field}: autocomplete did not fill the input`);
};

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    for (const locale of ['lv', 'en']) for (const width of [390, 1440]) {
      const label = `${locale}/${width}`;
      const context = await browser.newContext({viewport: {width, height: 900}});
      const page = await context.newPage(), errors = [], api = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        const url = new URL(response.url());
        if (url.pathname.startsWith('/api/transport/')) {
          api.push({url, status: response.status(), cacheControl: response.headers()['cache-control'] || ''});
        }
      });

      const response = await page.goto(`${base}/${locale}/transport`, {waitUntil: 'domcontentloaded'});
      assert.equal(response.status(), 200, `${label}: planner page did not load`);

      // --- wiring that makes the same-origin proxy work ------------------
      const body = page.locator('body');
      assert.equal(await body.getAttribute('data-base-path'), '', `${label}: data-base-path must be empty`);
      assert.equal(await body.getAttribute('data-website-base'), websiteBase, `${label}: wrong data-website-base`);

      const html = await page.content();
      for (const needle of ['__BASE_PATH__', '__WEBSITE_BASE_URL__', 'shurp.proofit.lv']) {
        assert.equal(html.includes(needle), false, `${label}: page still contains ${needle}`);
      }

      const robots = page.locator('meta[name="robots"]');
      if (expectNoindex) {
        assert.equal(await robots.count(), 1, `${label}: expected exactly one robots meta`);
        assert.match(await robots.getAttribute('content'), /noindex/, `${label}: robots meta is not noindex`);
      } else {
        const content = await robots.count() ? await robots.first().getAttribute('content') : '';
        assert.equal(/noindex/.test(content), false, `${label}: page is still noindex`);
      }

      // --- a real search through /api/transport/... ----------------------
      await pickPlace(page, 'from', places.from);
      await pickPlace(page, 'to', places.to);

      const journeys = page.waitForResponse(
        r => new URL(r.url()).pathname === '/api/transport/journeys', {timeout: 30000});
      await page.locator('#planner button.search').click();
      const search = await journeys;
      assert.equal(search.status(), 200, `${label}: /api/transport/journeys returned ${search.status()}`);
      await page.locator('#result-list article, #result-list .empty').first()
        .waitFor({state: 'attached', timeout: 30000});

      // --- every planner API call, not just the journey search -----------
      assert.ok(api.length >= 2, `${label}: expected place lookups and a journey search, saw ${api.length} calls`);
      assert.ok(api.some(call => call.url.pathname === '/api/transport/places'),
        `${label}: the autocomplete never called /api/transport/places`);
      for (const call of api) {
        assert.equal(call.url.origin, origin, `${label}: ${call.url.href} is not same-origin`);
        assert.equal(call.status, 200, `${label}: ${call.url.pathname} returned ${call.status}`);
        assert.match(call.cacheControl, /no-store/, `${label}: ${call.url.pathname} is missing Cache-Control: no-store`);
      }

      assert.deepEqual(errors, [], `${label}: page errors`);
      console.log(`PASS transport planner ${label}: ${api.length} same-origin API call(s), noindex=${expectNoindex}`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exit(1);});
