const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
function fixture(id) {
  const result = id === 'win' ? [3, 1] : id === 'draw' ? [2, 2] : [1, 3];
  const hero = id.startsWith('luna') ? 'Luna' : 'Nova';
  return '<html><body><div class="v3-match__header">' +
    ['Team A', 'Team B'].map((team, i) => '<div class="v3-match__entry"><span class="label">' + team + '</span><span class="value">' + result[i] + '</span></div>').join('') +
    '</div><table><thead><tr><th>Team A</th></tr></thead><tbody><tr><td>MrKilometer</td></tr></tbody></table>' +
    '<table><thead><tr><th>Team B</th></tr></thead><tbody><tr><td>Opponent MVP <img src="/heroes/' + hero + '.png" alt="' + hero + '"></td></tr></tbody></table></body></html>';
}
async function stored(popup) {
  return popup.evaluate(() => new Promise(resolve => chrome.storage.local.get(null, resolve)));
}
async function visit(context, id) {
  const page = await context.newPage();
  await page.goto('https://tracker.gg/marvel-rivals/matches/' + id, { waitUntil: 'domcontentloaded' });
  await page.locator('#hero-tracker-overlay').waitFor({ timeout: 15000 });
  return page;
}
async function download(popup, button) {
  const [item] = await Promise.all([popup.waitForEvent('download'), popup.locator(button).click()]);
  return fs.readFileSync(await item.path(), 'utf8');
}

test('MV3 extension in disposable Chromium: match, duplicate, export, restore and authorization', { timeout: 120000 }, async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-smoke-'));
  let browser;
  try {
    browser = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: true, acceptDownloads: true,
      args: ['--disable-extensions-except=' + root, '--load-extension=' + root, '--disable-background-networking']
    });
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker', { timeout: 20000 });
    const id = new URL(worker.url()).hostname;
    assert.match(id, /^[a-p]{32}$/);
    // Offline fixtures only. No Tracker.gg requests are sent to the real site.
    await browser.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'tracker.gg' && url.pathname.startsWith('/marvel-rivals/matches/') && route.request().isNavigationRequest())
        return route.fulfill({ status: 200, contentType: 'text/html', body: fixture(url.pathname.split('/').pop()) });
      if (url.protocol === 'http:' || url.protocol === 'https:') return route.abort();
      return route.continue();
    });
    const popup = await browser.newPage();
    await popup.goto('chrome-extension://' + id + '/popup.html');
    await popup.locator('#matchCount').waitFor();

    await Promise.all([visit(browser, 'luna-1'), visit(browser, 'nova-2')]);
    const first = await stored(popup);
    assert.deepEqual([...first.heroTrackerProcessedMatches].sort(), ['luna-1', 'nova-2']);
    assert.equal(first.heroTrackerStats.Luna.losses, 1);
    assert.equal(first.heroTrackerStats.Nova.weightedLosses, 1.2);
    await popup.waitForFunction(() => document.querySelector('#matchCount').textContent.includes('2 matches seen'));
    const repeat = await visit(browser, 'luna-1');
    assert.match(await repeat.locator('#hero-tracker-overlay').innerText(), /already processed/i);
    await Promise.all([visit(browser, 'win'), visit(browser, 'draw')]);
    assert.equal((await stored(popup)).heroTrackerProcessedMatches.length, 4);
    assert.equal((await stored(popup)).heroTrackerStats.Luna.losses, 1);

    const csv = await download(popup, '#exportCsv');
    assert.match(csv, /"Luna","1","1","1.2","1"/);
    const oldJson = JSON.parse(await download(popup, '#exportJson'));
    assert.equal(oldJson.Nova.losses, 1);
    const backup = JSON.parse(await download(popup, '#exportBackup'));
    assert.equal(backup.schemaVersion, 1);
    assert.equal(backup.processedMatchIds.length, 4);

    // Same extension origin but NOT the actual popup URL must not clear data.
    const spoof = await browser.newPage();
    await spoof.goto('chrome-extension://' + id + '/popup.html?not-the-popup=1');
    const denied = await spoof.evaluate(() => new Promise(resolve => chrome.runtime.sendMessage({ type: 'heroTracker/clearData' }, resolve)));
    assert.equal(denied.ok, false);
    assert.equal((await stored(popup)).heroTrackerProcessedMatches.length, 4);

    await popup.locator('#backupFile').setInputFiles({name:'bad.json', mimeType:'application/json', buffer:Buffer.from('{invalid')});
    await popup.waitForFunction(() => document.querySelector('#backupStatus').textContent.includes('Invalid JSON'));
    assert.equal(await popup.locator('#restoreBackup').isDisabled(), true);
    await popup.locator('#backupFile').setInputFiles({name:'good.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(backup))});
    await popup.waitForFunction(() => !document.querySelector('#restoreBackup').disabled);
    popup.once('dialog', dialog => dialog.accept());
    await popup.locator('#restoreBackup').click();
    await popup.waitForFunction(() => /^(Restored |Restore failed:)/.test(document.querySelector('#backupStatus').textContent));
    assert.match(await popup.locator('#backupStatus').innerText(), /^Restored /);
    assert.deepEqual((await stored(popup)).heroTrackerProcessedMatches, backup.processedMatchIds);
    await popup.reload();
    assert.deepEqual((await stored(popup)).heroTrackerStats, backup.stats);

    popup.once('dialog', dialog => dialog.accept());
    await popup.locator('#clearData').click();
    await popup.waitForFunction(() => document.querySelector('#matchCount').textContent.includes('0 matches seen'));
    assert.equal((await stored(popup)).heroTrackerProcessedMatches, undefined);
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
