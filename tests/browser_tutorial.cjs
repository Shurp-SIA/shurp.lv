const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:18097';
// Requires the candidate's isolated analytics collector to be enabled.
(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    for (const locale of ['lv', 'en']) for (const width of [320, 768, 1440]) {
      const context = await browser.newContext({viewport: {width, height: 900}});
      await context.addInitScript(() => localStorage.setItem('shurp-analytics-consent-v1', 'granted'));
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const eventResponse = () => page.waitForResponse(response => new URL(response.url()).pathname === '/api/analytics/events');
      const view = eventResponse();
      const response = await page.goto(`${base}/${locale}/tutorial`, {waitUntil: 'networkidle'});
      assert.equal(response.status(), 200);
      const tracked = await view;
      assert.equal(tracked.status(), 204);
      const events = tracked.request().postDataJSON().events;
      assert(events.some(event => event.event === 'page_view' && event.props.page === 'tutorial' && event.props.locale === locale));
      const links = page.locator('.homepage-links > a'), toggle = page.locator('#homepage-menu-toggle');
      assert.equal(await links.count(), 5);
      assert.equal(await links.nth(1).getAttribute('aria-current'), 'page');
      if (width < 768) {
        await toggle.click();
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        for (const link of await links.all()) assert(await link.isVisible());
        await page.keyboard.press('Escape');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        await toggle.click();
      }
      const safetyEvent = eventResponse();
      await links.nth(2).click();
      await page.waitForFunction(() => document.getElementById('faq-safety').classList.contains('open'));
      const safety = await safetyEvent;
      assert.equal(safety.status(), 204);
      assert(safety.request().postDataJSON().events.some(event => event.event === 'navigation_click' && event.props.target === 'safety'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (width < 768) await toggle.click();
      await page.locator(width < 768 ? '.mobile-download a' : '.homepage-actions > .scroll-to-badges').click();
      await page.waitForURL(`**/${locale}/#download`);
      assert(await page.locator('#download').count());
      assert.deepEqual(errors, []);
      console.log(`PASS tutorial ${locale}/${width}: mobile navigation, section targets and accepted analytics`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
