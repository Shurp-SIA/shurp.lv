const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:18096';
const artifacts = process.env.ARTIFACTS || '/artifacts';
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    for (const locale of ['lv','en']) for (const width of [320,390,768,1440]) {
      const context = await browser.newContext({viewport:{width,height:844}});
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/${locale}/`, {waitUntil:'networkidle'});
      const nav = page.locator('.nav-bar'), links = page.locator('.homepage-links > a');
      const toggle = page.locator('#homepage-menu-toggle'), menu = page.locator('#homepage-nav-links');
      assert.deepEqual(await links.evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))), ['#how-it-works','tutorial','tutorial#faq-safety','#legal',`/${locale}/transport`]);
      assert.equal(await nav.locator('.homepage-actions > .scroll-to-badges').getAttribute('href'),'#download');
      if (width < 768) {
        assert.equal(await toggle.isVisible(),true);
        assert.equal(await menu.isVisible(),false);
        const logo = await nav.locator('.homepage-brand img').boundingBox(), target = await toggle.boundingBox();
        assert.ok(logo.width >= 66 && logo.width < 68, `${locale}/${width}: logo shrank`);
        assert.ok(target.width >= 44 && target.height >= 44, `${locale}/${width}: toggle target too small`);
        assert.equal(await nav.locator('.homepage-actions > .scroll-to-badges').isVisible(),false);
        await toggle.focus(); await page.keyboard.press('Enter');
        assert.equal(await toggle.getAttribute('aria-expanded'),'true');
        assert.equal(await links.first().evaluate(el => document.activeElement === el),true, `${locale}/${width}: opening menu did not enter its links`);
        for (const link of await links.all()) {
          assert.equal(await link.isVisible(),true);
          const rect = await link.boundingBox(); assert.ok(rect.x >= 0 && rect.x+rect.width <= width && rect.height >= 44);
        }
        assert.equal(await menu.locator('.mobile-download a').getAttribute('href'),'#download');
        for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
        assert.equal(await links.last().evaluate(el => document.activeElement === el), true, `${locale}/${width}: keyboard cannot reach public transport`);
        if (fs.existsSync(artifacts)) await page.screenshot({path:`${artifacts}/homepage-menu-${locale}-${width}.png`});
        await page.keyboard.press('Escape');
        assert.equal(await menu.isVisible(),false);
        assert.equal(await toggle.getAttribute('aria-expanded'),'false');
        assert.equal(await toggle.evaluate(el => document.activeElement === el),true);
        await toggle.click();
        await page.mouse.click(width - 12, 800);
        assert.equal(await menu.isVisible(),false, `${locale}/${width}: outside click did not close menu`);
        await toggle.click();
        await menu.locator('.mobile-download a').click();
        assert.equal(await menu.isVisible(),false);
        assert.equal(new URL(page.url()).pathname,`/${locale}/`);
        assert.equal(await page.locator('#download').evaluate(el => document.activeElement === el), true, `${locale}/${width}: closing Download link lost focus`);
        await page.waitForTimeout(700);
        const badges = await page.locator('#download').boundingBox();
        assert.ok(badges.y >= 0 && badges.y+badges.height <= 844, `${locale}/${width}: Download did not reveal store badges`);
        await toggle.click();
        const arrival=page.waitForURL(`**/${locale}/transport`);
        await links.last().click(); await arrival;
        assert.equal(new URL(page.url()).pathname,`/${locale}/transport`, `${locale}/${width}: transport menu action did not navigate`);
      } else {
        assert.equal(await toggle.isVisible(),false);
        assert.equal(await menu.isVisible(),true);
        assert.equal(await menu.locator('.mobile-download').isVisible(),false);
        const rects = await links.evaluateAll(nodes => nodes.map(node => {const r=node.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right}}));
        assert.ok(rects.every(rect=>rect.x>=0 && rect.right<=width),`${locale}/${width}: desktop/tablet navigation clipped`);
        assert.ok(rects.every(rect=>Math.abs(rect.y-rects[0].y)<1),`${locale}/${width}: section links no longer share one row`);
        if (fs.existsSync(artifacts)) await page.screenshot({path:`${artifacts}/homepage-menu-${locale}-${width}.png`});
      }
      assert.deepEqual(errors,[],`${locale}/${width}: page errors`);
      console.log(`PASS homepage navigation ${locale} ${width}`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exit(1)});
