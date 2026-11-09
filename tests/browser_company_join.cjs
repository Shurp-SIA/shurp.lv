const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:18094';
const shots = process.env.ARTIFACTS;
(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    for (const locale of ['lv', 'en']) for (const width of [390, 1280]) {
      const context = await browser.newContext({viewport: {width, height: 844}});
      const page = await context.newPage(), errors = [], external = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (new URL(request.url()).origin !== new URL(base).origin) external.push(request.url()); });
      const response = await page.goto(`${base}/c/ABC123${locale === 'en' ? '?lang=en' : ''}`, {waitUntil: 'networkidle'});
      assert.equal(response.status(), 200);
      assert.equal(response.request().redirectedFrom(), null);
      assert.equal(await page.locator('h1').textContent(), locale === 'lv' ? 'Pievienojies sava uzņēmuma Shurp kopbraucienu programmai' : "Join your company's Shurp carpool programme");
      assert.equal(await page.locator('html').getAttribute('lang'), locale);
      assert.equal(await page.locator('.store-badges a').nth(0).getAttribute('href'), 'https://apps.apple.com/app/shurp/id6760924489');
      assert.equal(await page.locator('.store-badges a').nth(1).getAttribute('href'), 'https://play.google.com/store/apps/details?id=lv.shurp.app');
      assert.equal(await page.locator('#company-code').isVisible(), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (shots) { fs.mkdirSync(shots, {recursive: true}); await page.screenshot({path: `${shots}/company-join-${locale}-${width}.png`, fullPage: true}); }
      // Switch language through the shared menu; the company path must survive.
      if (width < 768) await page.locator('[data-nav-trigger]').click();
      await page.locator(`${width < 768 ? '[data-nav-menu]' : '.nav-choice-row'} [data-language="${locale === 'lv' ? 'en' : 'lv'}"]`).click();
      await page.waitForLoadState('networkidle');
      assert.equal(new URL(page.url()).pathname, '/c/ABC123');
      assert.equal(await page.locator('html').getAttribute('lang'), locale === 'lv' ? 'en' : 'lv');
      for (const code of ['ABC1234567', 'ab-c1234567', 'OIL1234567']) {
        await page.goto(`${base}/c/${code}`);
        assert.equal(await page.locator('#company-code').textContent(), 'Uzņēmuma kods: ' + code.toUpperCase().replace(/-/g, '').replace(/O/g, '0').replace(/[IL]/g, '1'));
      }
      for (const code of ['ABC123', 'UUUUUUUUUU', 'ABC12345678', 'ABC1234567/extra', '%3Cscript%3E', '%E0%A4%A', 'ABC1234567.html']) {
        const invalid = await page.goto(`${base}/c/${code}`);
        assert.equal(invalid.status(), 200);
        assert.equal(invalid.request().redirectedFrom(), null);
        assert.equal(await page.locator('#company-code').isVisible(), false);
        assert.equal(await page.locator('#company-code').textContent(), '');
      }
      for (const file of ['apple-app-site-association', 'assetlinks.json']) {
        const association = await context.request.get(`${base}/.well-known/${file}`, {maxRedirects: 0});
        assert.equal(association.status(), 200);
        assert.match(association.headers()['content-type'], /^application\/json/);
        await association.json();
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
      console.log(`PASS company join ${locale}/${width}: copy, links, language, code validation, JSON, no external requests`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
