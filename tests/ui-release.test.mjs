import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ui = require('../tools/ui-release.js');
const BASE_URL = 'https://1547ae47.sporteventmap.pages.dev';
const BUILD_TIME = new Date('2026-09-08T11:30:00.000Z');
const put = (root, relative, bytes) => { const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); };
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commit = root => { git(root, 'add', '.'); git(root, '-c', 'user.name=UI release fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Committed UI fixture'); return git(root, 'rev-parse', 'HEAD'); };
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sem-ui-release-unit-'));
  git(root, 'init', '-q'); git(root, 'config', 'core.autocrlf', 'false');
  put(root, '.gitignore', 'dist/\nexports/\n');
  put(root, '.gitattributes', '*.js text\n*.html text\n*.css text\n');
  for (const relative of new Set([...ui.RUNTIME_PATHS, ...ui.OVERLAY_PATHS])) {
    put(root, relative, relative.endsWith('.html') ? '<!doctype html><html><head><link rel="stylesheet" href="css/style.css"><script src="js/theme.js"></script></head><body>Current UI</body></html>\r\n' : `/* committed ${relative} */\r\n`);
  }
  put(root, 'index.html', '<!doctype html><html><head><link rel="stylesheet" href="css/mobile-discovery.css"><script src="js/config.js"></script><script src="js/freshness-batch-review.js"></script></head><body>Current UI</body></html>\r\n');
  put(root, 'RELEASE_VERSION.txt', 'Sport Event Map\nVersion: 20260908-ui-only-v85\n');
  put(root, 'js/config.js', 'Source config is deliberately different; never overlay this.');
  put(root, 'data/events.csv', 'Committed but unreleased newer data must never be copied.');
  const sourceCommit = commit(root), baseDir = path.join(root, 'dist'); fs.mkdirSync(baseDir);
  for (const relative of ui.RUNTIME_PATHS) {
    if (['js/freshness-batch-review.js', 'js/mobile-discovery.js', 'css/mobile-discovery.css'].includes(relative)) continue;
    put(baseDir, relative, ui.OVERLAY_PATHS.includes(relative) ? `/* old deployed ${relative} */\n` : fs.readFileSync(path.join(root, relative)));
  }
  for (const relative of ['index.html', 'about.html', 'contact.html', 'imprint.html', 'legal.html', 'privacy.html']) put(baseDir, relative, '<html><head></head><body>Original v84</body></html>');
  const exportedAt = '2026-08-27T07:41:01.290Z';
  put(baseDir, 'data/catalog-export-manifest.json', JSON.stringify({ exported_at: exportedAt, metrics: { archive_rows: 2 } }));
  put(baseDir, 'data/event-editions-public.json', JSON.stringify({ exported_at: exportedAt, editions: [{ edition_slug: 'first' }, { edition_slug: 'second' }] }));
  for (const [relative, text] of Object.entries({ 'data/events.csv': 'Original exported catalog', 'data/event-knowledge.json': '{"original":true}', 'event/first/index.html': '<html>Original static event A</html>', 'event/second/index.html': '<html>Original static event B</html>', 'sitemap.xml': '<urlset>Original sitemap</urlset>', 'js/config.js': 'window.PUBLIC_CONFIG={siteUrl:"https://sporteventmap.com"};', 'robots.txt': 'Original robots', 'docs/NO_CODE_DATA_IMPORT.md': 'Original docs', 'RELEASE_VERSION.txt': 'Version: 20260901-mobile-stability-v84\n' })) put(baseDir, relative, text);
  const entries = ui.artifactInventory(baseDir), byPath = new Map(entries.map(e => [e.path, e.sha256]));
  const release = { schema_version: 1, version: '20260901-mobile-stability-v84', git_commit: '8'.repeat(40), built_at: '2026-09-01T11:25:56.965Z', source_dirty: false, critical_files: Object.fromEntries(ui.BASE_CRITICAL_PATHS.map(p => [p, byPath.get(p)])), event_pages: { count: 2, aggregate_sha256: ui.inventoryDigest(entries.filter(e => /^event\//.test(e.path))) }, artifacts: { count: entries.length, aggregate_sha256: ui.inventoryDigest(entries) } };
  put(baseDir, 'release.json', `${JSON.stringify(release, null, 2)}\n`);
  const bytes = fs.readFileSync(path.join(baseDir, 'release.json'));
  const options = { root, baseDir: 'dist', baseUrl: BASE_URL, baseReleaseSha256: ui.sha256(bytes), sourceCommit, version: '20260908-ui-only-v85', out: 'exports/ui-release-20260908/package', package: 'exports/ui-release-20260908/package' };
  const fetchImpl = async (url, init) => { assert.equal(url, `${BASE_URL}/release.json`); assert.equal(init.redirect, 'error'); const response = new Response(bytes, { status: 200 }); Object.defineProperty(response, 'url', { value: url }); return response; };
  return { root, baseDir, bytes, entries, options, dependencies: { fetchImpl, now: () => BUILD_TIME }, output: path.join(root, options.out) };
}
function dispose(root) {
  const resolved = fs.realpathSync(root), parent = fs.realpathSync(os.tmpdir());
  assert.equal(path.dirname(resolved), parent); assert.ok(path.basename(resolved).startsWith('sem-ui-release-unit-'));
  // Only this test's mkdtemp directory; the production tool never removes any output.
  fs.rmSync(resolved, { recursive: true, force: true });
}

test('UI-only package binds the actual committed CRLF source, immutable base and all protected bytes', async t => {
  const f = fixture();
  try {
    const built = await ui.buildUiRelease(f.options, f.dependencies);
    assert.equal(built.release_scope, 'ui_only'); assert.equal(built.data_updated, false); assert.equal(built.full_data_quality_release, false);
    assert.equal(built.built_at, BUILD_TIME.toISOString()); assert.equal(built.base_release.built_at, '2026-09-01T11:25:56.965Z');
    assert.equal(built.base_release.original_data_timestamps.catalog_exported_at, '2026-08-27T07:41:01.290Z');
    assert.equal(Object.keys(built.overlay_files).length, 15);
    assert.deepEqual(ui.artifactInventory(f.baseDir), f.entries, 'Build never changes dist');
    for (const entry of f.entries.filter(e => !ui.OVERLAY_PATHS.includes(e.path))) assert.equal(ui.sha256(fs.readFileSync(path.join(f.output, entry.path))), entry.sha256, entry.path);
    assert.equal(built.overlay_files['js/app.js'].source_sha256, ui.sha256(fs.readFileSync(path.join(f.root, 'js/app.js'))));
    assert.equal(built.overlay_files['js/app.js'].source_git_blob, git(f.root, 'rev-parse', 'HEAD:js/app.js'));
    assert.ok(fs.readFileSync(path.join(f.output, 'index.html'), 'utf8').includes('content="ui_only"'));
    assert.ok(fs.readFileSync(path.join(f.output, 'RELEASE_VERSION.txt'), 'utf8').includes('20260908-ui-only-v85'));
    await ui.verifyUiRelease(f.options, f.dependencies);
    await t.test('existing output refuses rebuild without removing a byte', async () => {
      const before = fs.readFileSync(path.join(f.output, 'release.json'));
      await assert.rejects(ui.buildUiRelease(f.options, f.dependencies), /Refusing existing/); assert.ok(fs.readFileSync(path.join(f.output, 'release.json')).equals(before));
    });
    for (const relative of ['data/events.csv', 'data/event-editions-public.json', 'event/first/index.html', 'sitemap.xml', 'js/config.js', 'docs/NO_CODE_DATA_IMPORT.md', 'js/map.js']) {
      await t.test(`protected tampering is rejected even if the output manifest is recomputed: ${relative}`, async () => {
        const target = path.join(f.output, relative), before = fs.readFileSync(target), releaseBytes = fs.readFileSync(path.join(f.output, 'release.json'));
        try {
          fs.appendFileSync(target, '\nTAMPER');
          const tampered = JSON.parse(releaseBytes), entries = ui.artifactInventory(f.output);
          tampered.artifacts.aggregate_sha256 = ui.inventoryDigest(entries);
          tampered.protected_artifacts.aggregate_sha256 = ui.inventoryDigest(entries.filter(e => !ui.OVERLAY_PATHS.includes(e.path)));
          tampered.critical_files[relative] = ui.sha256(fs.readFileSync(target));
          put(f.output, 'release.json', JSON.stringify(tampered));
          await assert.rejects(ui.verifyUiRelease(f.options, f.dependencies), /Protected deployed artifact inventory changed/);
        } finally { fs.writeFileSync(target, before); put(f.output, 'release.json', releaseBytes); }
      });
    }
    await t.test('unknown output file rejected', async () => { put(f.output, 'unexpected.js', 'extra'); try { await assert.rejects(ui.verifyUiRelease(f.options, f.dependencies), /Protected|Unexpected/); } finally { fs.unlinkSync(path.join(f.output, 'unexpected.js')); } });
    await t.test('current UI bytes cannot be changed independently of committed source', async () => { const target = path.join(f.output, 'js/app.js'), before = fs.readFileSync(target); try { fs.appendFileSync(target, 'tamper'); await assert.rejects(ui.verifyUiRelease(f.options, f.dependencies), /Overlay bytes differ/); } finally { fs.writeFileSync(target, before); } });
    await t.test('truthful UI scope and original data age cannot be rewritten', async () => { const target = path.join(f.output, 'release.json'), before = fs.readFileSync(target); try { const forged = JSON.parse(before); forged.data_updated = true; forged.base_release.original_data_timestamps.archive_exported_at = BUILD_TIME.toISOString(); put(f.output, 'release.json', JSON.stringify(forged)); await assert.rejects(ui.verifyUiRelease(f.options, f.dependencies), /UI manifest differs/); } finally { fs.writeFileSync(target, before); } });
    await t.test('dirty source and stale Git identity rejected', async () => { const target = path.join(f.root, 'js/app.js'), before = fs.readFileSync(target); try { fs.appendFileSync(target, 'dirty'); await assert.rejects(ui.verifyUiRelease(f.options, f.dependencies), /clean committed source/); } finally { fs.writeFileSync(target, before); } await assert.rejects(ui.verifyUiRelease({ ...f.options, sourceCommit: '1'.repeat(40) }, f.dependencies), /source HEAD differs/); });
    await t.test('source mutation during remote await is rejected', async () => { const target = path.join(f.root, 'js/app.js'), before = fs.readFileSync(target); try { await assert.rejects(ui.verifyUiRelease(f.options, { ...f.dependencies, fetchImpl: async (...args) => { const response = await f.dependencies.fetchImpl(...args); fs.appendFileSync(target, 'racing source mutation'); return response; } }), /clean committed source|Source changed/); } finally { fs.writeFileSync(target, before); } });
    await t.test('source commit changing after build requires a fresh package', async () => { put(f.root, 'README.md', 'new committed source identity'); const newCommit = commit(f.root); await assert.rejects(ui.verifyUiRelease(f.options, f.dependencies), /source HEAD differs/); await assert.rejects(ui.verifyUiRelease({ ...f.options, sourceCommit: newCommit }, f.dependencies), /Package source identity changed/); });
  } finally { dispose(f.root); }
});

test('base validation covers unlisted files and all catalog/static hashes', async t => {
  const f = fixture();
  try {
    assert.equal(ui.validateBaseRelease(f.baseDir, f.options.baseReleaseSha256).entries.length, f.entries.length);
    for (const relative of ['data/events.csv', 'event/second/index.html', 'sitemap.xml', 'js/config.js', 'docs/NO_CODE_DATA_IMPORT.md']) await t.test(`base drift: ${relative}`, () => { const file = path.join(f.baseDir, relative), before = fs.readFileSync(file); try { fs.appendFileSync(file, 'drift'); assert.throws(() => ui.validateBaseRelease(f.baseDir, f.options.baseReleaseSha256), /Base .*hash mismatch/); } finally { fs.writeFileSync(file, before); } });
    put(f.baseDir, 'unknown.txt', 'not in signed aggregate'); assert.throws(() => ui.validateBaseRelease(f.baseDir, f.options.baseReleaseSha256), /artifact count mismatch/); fs.unlinkSync(path.join(f.baseDir, 'unknown.txt'));
    const manifestFile = path.join(f.baseDir, 'release.json'), before = fs.readFileSync(manifestFile), malformed = JSON.parse(before); malformed.artifacts.aggregate_sha256 = '0'.repeat(64); put(f.baseDir, 'release.json', JSON.stringify(malformed)); assert.throws(() => ui.validateBaseRelease(f.baseDir, ui.sha256(fs.readFileSync(manifestFile))), /inventory hash mismatch/); fs.writeFileSync(manifestFile, before);
    await assert.rejects(ui.buildUiRelease({ ...f.options, out: 'dist' }, f.dependencies), /separate exports/);
    await assert.rejects(ui.buildUiRelease(f.options, { ...f.dependencies, fetchImpl: async (...args) => { const response = await f.dependencies.fetchImpl(...args); return new Response('different remote release', { status: 200, headers: { 'content-length': '24' } }); } }), /response URL changed/);
    await assert.rejects(ui.verifyRemoteBase(BASE_URL, f.bytes, async url => { const response = new Response(Buffer.concat([f.bytes, Buffer.from('\n')]), { status: 200 }); Object.defineProperty(response, 'url', { value: url }); return response; }), /differs from local bytes/);
    await assert.rejects(ui.verifyRemoteBase(BASE_URL, f.bytes, async url => { const response = new Response(f.bytes); Object.defineProperties(response, { url: { value: url }, redirected: { value: true } }); return response; }), /redirects are forbidden/);
    await assert.rejects(ui.verifyRemoteBase(BASE_URL, f.bytes, async url => { const response = new Response('x'.repeat(2 * 1024 * 1024 + 1)); Object.defineProperty(response, 'url', { value: url }); return response; }), /too large/);
  } finally { dispose(f.root); }
});

test('new dependencies and committed credentials fail before output creation', async t => {
  const f = fixture();
  try {
    await t.test('non-overlay changed runtime cannot slip in', async () => { fs.appendFileSync(path.join(f.root, 'js/map.js'), 'changed runtime'); const head = commit(f.root); await assert.rejects(ui.buildUiRelease({ ...f.options, sourceCommit: head }, f.dependencies), /runtime dependency differs/); assert.equal(fs.existsSync(f.output), false); fs.writeFileSync(path.join(f.root, 'js/map.js'), fs.readFileSync(path.join(f.baseDir, 'js/map.js'))); f.options.sourceCommit = commit(f.root); });
    await t.test('missing dynamically required module is rejected', async () => { const source = ui.sourceSnapshot(f.root, f.options.sourceCommit), base = ui.validateBaseRelease(f.baseDir, f.options.baseReleaseSha256), overlay = ui.makeOverlay(source, { version: f.options.version, git_commit: f.options.sourceCommit, built_at: BUILD_TIME.toISOString() }); overlay.set('index.html', Buffer.from('<html><head><script src="js/unreviewed-module.js"></script></head></html>')); assert.throws(() => ui.assertRuntime(base, source, overlay), /Missing UI dependency/); });
    await t.test('committed secret rejected by real build, not merely dirty-tree check', async () => { fs.appendFileSync(path.join(f.root, 'js/app.js'), '\nconst client_secret="this-is-a-realistic-secret-value";'); const head = commit(f.root); await assert.rejects(ui.buildUiRelease({ ...f.options, sourceCommit: head }, f.dependencies), /Potential private credential/); assert.equal(fs.existsSync(f.output), false); });
  } finally { dispose(f.root); }
});

test('URL contract, exact allowlist and focused secret detection', () => {
  assert.equal(ui.OVERLAY_PATHS.length, 15);
  for (const forbidden of ['data/events.csv', 'event/first/index.html', 'sitemap.xml', 'js/config.js', '_routes.json', '_worker.js', 'docs/NO_CODE_DATA_IMPORT.md']) assert.equal(ui.OVERLAY_PATHS.includes(forbidden), false);
  assert.equal(ui.validateBaseUrl(`${BASE_URL}/`), BASE_URL);
  for (const url of ['http://1547ae47.sporteventmap.pages.dev', 'https://sporteventmap.com', 'https://sporteventmap.pages.dev', 'https://123456789.sporteventmap.pages.dev', `${BASE_URL}:443`, `${BASE_URL}/path`, `${BASE_URL}?x=1`, `${BASE_URL}#x`, 'https://user@1547ae47.sporteventmap.pages.dev', 'https://1547ae47.sporteventmap.pages.dev.evil.invalid']) assert.throws(() => ui.validateBaseUrl(url));
  const jwt = role => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  // Assemble synthetic key markers at runtime so the repository secret hook stays enabled.
  const keyMarkers = ['PRIVATE', 'RSA PRIVATE'].map(kind => ['-----BEGIN', kind, 'KEY-----'].join(' '));
  for (const text of [...keyMarkers, `sb_secret_${'x'.repeat(28)}`, `ghp_${'a'.repeat(36)}`, `github_pat_${'a'.repeat(45)}`, 'const API_SECRET="sensitive-value";', 'const SUPABASE_SERVICE_ROLE_KEY="sensitive-value";', jwt('service_role'), jwt('authenticated')]) assert.throws(() => ui.assertOverlaySafe(Buffer.from(text), 'js/app.js'), /credential|JWT/);
  assert.doesNotThrow(() => ui.assertOverlaySafe(Buffer.from(`const roleNames=['service_role','anon']; /* private_key is a field label */ const publicToken='${jwt('anon')}';`), 'js/app.js'));
});
