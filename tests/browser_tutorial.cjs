const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:18097';
(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    for (const locale of ['lv', 'en']) for (const width of [320, 768, 1440]) {
      const context = await browser.newContext({viewport: {width, height: 900}});
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const response = await page.goto(`${base}/${locale}/tutorial`, {waitUntil: 'networkidle'});
      assert.equal(response.status(), 200);
      const links = page.locator('.homepage-links > a'), toggle = page.locator('#homepage-menu-toggle');
      assert.equal(await links.count(), 6);
      assert.equal(await links.nth(1).getAttribute('aria-current'), 'page');
      if (width < 768) {
        await toggle.click();
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        for (const link of await links.all()) assert(await link.isVisible());
        await page.keyboard.press('Escape');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        await toggle.click();
      }
      await links.nth(3).click();
      await page.waitForFunction(() => document.getElementById('faq-safety').classList.contains('open'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (width < 768) await toggle.click();
      await page.locator(width < 768 ? '.mobile-download a' : '.homepage-actions > .scroll-to-badges').click();
      await page.waitForURL(`**/${locale}/#download`);
      assert(await page.locator('#download').count());
      assert.deepEqual(errors, []);
      console.log(`PASS tutorial ${locale}/${width}: mobile navigation and section targets`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
