// Every page that carries the main menu must show the same six items, in the
// same order, in the language the page is written in.
//
//   node tests/check_nav_items.cjs
//
// A page "carries the main menu" when it has the shared <div
// id="homepage-nav-links"> list. Pages without it (the /get app handoff, the
// in-app help pages, the auth and identity pages) are reported as skipped, so
// a page that silently loses its menu shows up as a skip rather than a pass.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'public');

const EXPECTED = {
  lv: ['Kā tas strādā', 'Par kopbraukšanu un Shurp', 'Ziņas', 'Drošība', 'Juridiskā info', 'Sabiedriskais transports'],
  en: ['How It Works', 'What is carpooling', 'News', 'Safety', 'Legal Info', 'Public transport'],
};

function htmlFiles(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'assets' ? [] : htmlFiles(full);
    return entry.isFile() && entry.name.endsWith('.html') ? [full] : [];
  });
}

// The menu is the run of links between the list container and the download
// button that closes it, so a download CTA is never read as a menu item.
function menuLabels(html) {
  const start = html.indexOf('id="homepage-nav-links"');
  if (start < 0) return null;
  const rest = html.slice(start);
  const end = rest.indexOf('<div class="mobile-download"');
  const list = rest.slice(0, end < 0 ? rest.indexOf('</div>') : end);
  return [...list.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)]
    .map(match => match[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
}

const checked = [], skipped = [];
let failures = 0;

for (const file of htmlFiles(root).sort()) {
  const relative = path.relative(root, file);
  const html = fs.readFileSync(file, 'utf8');
  const labels = menuLabels(html);
  if (labels === null) { skipped.push(relative); continue; }
  const lang = (html.match(/<html[^>]*\blang="([a-z]{2})"/i) || [])[1];
  const expected = EXPECTED[lang];
  if (!expected) { console.error(`FAIL ${relative}: unknown page language ${lang}`); failures++; continue; }
  try {
    assert.deepEqual(labels, expected);
    checked.push(`${relative} (${lang})`);
  } catch (error) {
    console.error(`FAIL ${relative} (${lang})\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(labels)}`);
    failures++;
  }
}

console.log(`Pages with the main menu (${checked.length}):`);
for (const page of checked) console.log(`  OK  ${page}`);
console.log(`Pages without the main menu (${skipped.length}):`);
for (const page of skipped) console.log(`  --  ${page}`);

if (failures) { console.error(`\n${failures} page(s) do not carry the six-item menu.`); process.exit(1); }
assert(checked.length > 0, 'no page with the main menu was found');
console.log('\nAll pages with the main menu show the same six items, in order.');
