const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.BASE_URL || 'http://127.0.0.1:18094';
const consentKey = 'shurp-analytics-consent-v1';
const forbidden = ['private@example.test', 'auth-token', 'hash-secret'];

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, message) {
  const until = Date.now() + 2500;
  while (Date.now() < until) { if (check()) return; await pause(25); }
  assert.fail(message);
}
function state(enabled = true) { return { enabled, posts: [], configRequests: [] }; }
function events(s) { return s.posts.flatMap(post => JSON.parse(post.body).events); }

async function mock(page, s) {
  await page.route('**/api/analytics/config**', route => {
    s.configRequests.push(route.request());
    if (!s.hangConfig) route.fulfill({ status: s.configStatus || 200, contentType: 'application/json', body: JSON.stringify({ enabled: s.enabled }) });
  });
  await page.route('**/api/analytics/events', async route => {
    s.posts.push({ body: route.request().postData() || '', referrer: (await route.request().headerValue('referer')) || '' });
    await route.fulfill({ status: 204 });
  });
  await page.route(url => /^https?:$/.test(url.protocol) && url.origin !== new URL(base).origin, route => {
    s.externalRequests ||= []; s.externalRequests.push({ url: route.request().url(), at: Date.now() }); route.abort();
  });
}
async function fresh(browser, options = {}) {
  const context = await browser.newContext({ ...(options.userAgent ? { userAgent: options.userAgent } : {}) });
  if (options.consent) await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: consentKey, value: options.consent });
  if (options.privacySignal) await context.addInitScript(signal => Object.defineProperty(navigator, signal, { configurable: true, get: () => signal === 'globalPrivacyControl' ? true : '1' }), options.privacySignal);
  if (options.blockStorage) await context.addInitScript(() => Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('storage blocked'); } }));
  return context;
}

async function consentAndNavigation(browser) {
  const context = await fresh(browser), page = await context.newPage(), s = state();
  await mock(page, s);
  await page.goto(`${base}/en/?email=private@example.test#hash-secret`, { waitUntil: 'networkidle' });
  assert.equal(s.posts.length, 0, 'analytics posted before consent');
  await page.locator('.analytics-actions button').first().click();
  await waitFor(() => events(s).some(event => event.event === 'page_view'), 'allow did not emit page view');
  const external = page.locator('a[href^="http"]').first();
  await external.evaluate(link => link.addEventListener('click', event => event.preventDefault()));
  await external.click();
  const store = page.locator('.store-badges a').first();
  await store.evaluate(link => link.addEventListener('click', event => event.preventDefault()));
  await store.click();
  await waitFor(() => events(s).some(event => event.event === 'navigation_click' && event.props.target === 'external_service') && events(s).some(event => event.event === 'store_click'), 'navigation or store event missing');
  for (const post of s.posts) {
    assert.equal(post.referrer, '', 'analytics request included a referrer');
    for (const value of forbidden) assert.equal(post.body.includes(value), false, `analytics body leaked ${value}`);
  }
  assert.deepEqual(await page.evaluate(key => Object.keys(localStorage).sort()), [consentKey], 'only consent may persist');
  await context.close();
}

async function consentProtections(browser) {
  for (const mode of ['decline', 'withdraw']) {
    const context = await fresh(browser), page = await context.newPage(), s = state();
    await mock(page, s); await page.goto(`${base}/en/privacy.html`, { waitUntil: 'networkidle' });
    if (mode === 'decline') await page.locator('.analytics-actions button').nth(1).click();
    else { await page.locator('.analytics-actions button').first().click(); await page.locator('.analytics-settings').click(); await page.locator('.analytics-actions button').nth(1).click(); }
    await pause(220);
    assert.equal(s.posts.length, 0, `${mode}: queued events were not cleared`);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), consentKey), 'denied');
    await context.close();
  }
  const blocked = await fresh(browser, { blockStorage: true }), page = await blocked.newPage(), s = state();
  await mock(page, s); await page.goto(`${base}/en/terms.html`, { waitUntil: 'networkidle' });
  await page.locator('.analytics-actions button').first().click();
  await waitFor(() => events(s).some(event => event.event === 'page_view'), 'blocked storage prevented in-memory consent');
  await blocked.close();
}

async function noInit(browser, options, url, enabled = true) {
  const context = await fresh(browser, options), page = await context.newPage(), s = state(enabled);
  await mock(page, s); await page.goto(`${base}${url}`, { waitUntil: 'networkidle' }); await pause(80);
  assert.equal(await page.locator('.analytics-consent').count(), 0, `${url}: unexpected consent UI`);
  assert.equal(s.posts.length, 0, `${url}: unexpected analytics post`);
  if (options.privacySignal) assert.equal(s.configRequests.length, 0, `${url}: privacy signal initialized analytics`);
  await context.close();
}

async function getRedirect(browser, userAgent, expectedHost = 'shurp.lv') {
  const context = await fresh(browser, { consent: 'granted', userAgent }), page = await context.newPage(), s = state();
  await mock(page, s); const started = Date.now();
  await page.goto(`${base}/get.html`, { waitUntil: 'domcontentloaded' });
  await waitFor(() => s.externalRequests?.length, 'get did not redirect');
  assert.ok(s.externalRequests[0].at - started < 850, 'analytics delayed redirect');
  assert.equal(new URL(s.externalRequests[0].url).hostname, expectedHost);
  await waitFor(() => events(s).some(event => event.event === 'app_redirect'), 'redirect was not counted');
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await consentAndNavigation(browser);
    await consentProtections(browser);
    await noInit(browser, { privacySignal: 'globalPrivacyControl' }, '/en/');
    await noInit(browser, { privacySignal: 'doNotTrack' }, '/en/privacy.html');
    await noInit(browser, {}, '/not-a-marketing-page');
    await noInit(browser, {}, '/auth/callback?auth-token=secret');
    await noInit(browser, {}, '/en/privacy.html', false);
    await getRedirect(browser);
    await getRedirect(browser, 'Mozilla/5.0 (Linux; Android 14)', 'play.google.com');
  } finally { await browser.close(); }
  console.log('analytics browser checks passed');
})().catch(error => { console.error(error); process.exit(1); });
