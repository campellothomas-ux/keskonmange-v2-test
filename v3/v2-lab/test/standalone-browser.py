"""Vérifie le fichier livré, le refus file:// administré et l’aperçu opaque.
Le serveur éphémère appartient seulement au banc de test, jamais à la démo.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from playwright.sync_api import sync_playwright, expect
import json
import os

LAB = Path(__file__).resolve().parents[1]
OUTPUT = Path(os.environ.get('KM_DEMO_OUTPUT', LAB / 'reports' / 'standalone'))
OUTPUT.mkdir(parents=True, exist_ok=True)
ARTIFACT = Path(os.environ.get('KM_DEMO_HTML', LAB / 'dist' / 'KeskonMange-Demo-V2.html'))
PREVIEW = Path(os.environ.get('KM_DEMO_PREVIEW', OUTPUT / 'preview-test.html'))
routes = {'/demo.html': ARTIFACT, '/preview.html': PREVIEW}
report = {'directFileOpening': {}, 'scenarios': [], 'externalAppRequests': [], 'previewHostResourcesBlockedByTest': [], 'pageErrors': [], 'macSafariTested': False}
reference_styles = {}
STYLE_SNAPSHOT = """() => Object.fromEntries(['.brand','.button:not(.small)','#search-input','.intro','.notice','.nav-button','.page-title'].map(sel => {
  const node=document.querySelector(sel); if(!node) throw Error('Élément absent : '+sel);
  const s=getComputedStyle(node);
  return [sel,Object.fromEntries(['fontSize','fontFamily','fontWeight','lineHeight','color','backgroundColor','padding'].map(k=>[k,s[k]]))];
}))"""

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        target = routes.get(self.path)
        if target is None:
            self.send_error(404)
            return
        body = target.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass

def record(name, fn):
    try:
        fn()
        report['scenarios'].append({'name': name, 'status': 'passed'})
    except Exception as error:
        report['scenarios'].append({'name': name, 'status': 'failed', 'error': str(error)})
        raise

def settle(frame):
    frame.evaluate('async () => { await SYNC_QUEUE; }')

def current(frame):
    settle(frame)
    return frame.evaluate('STATE')

def exercise(frame):
    expect(frame.locator('#auth-gate')).to_be_hidden()
    assert frame.locator('.nav-button').all_text_contents() == ['Recettes', 'Planning', 'Courses']
    assert len(current(frame)['recipes']) == 11
    frame.locator('#show-out').check()
    assert frame.locator('.recipe-card').count() == 11
    frame.locator('#search-input').fill('poulet')
    assert frame.locator('.recipe-card').count() >= 4
    frame.locator('#search-input').fill('')
    frame.locator('.recipe-card [data-action="toggle-favorite"][data-id="lot0-recette-3"]').click()
    assert 'lot0-recette-3' in current(frame)['favorites']
    frame.locator('.recipe-card-main[data-id="lot0-recette-1"]').click()
    before = frame.locator('.ingrow strong').first.inner_text()
    frame.locator('[data-action="detail-portions"][data-delta="1"]').click()
    assert frame.locator('.ingrow strong').first.inner_text() != before
    assert '{{q:' not in frame.locator('.steps').inner_text()
    frame.locator('[data-action="add-to-plan"]').click(); settle(frame)
    frame.locator('.nav-button[data-view="planning"]').click()
    assert frame.locator('.meal-card').count() == 4
    frame.locator('[data-action="meal-portions"][data-delta="1"]').first.click(); settle(frame)
    frame.locator('[data-action="refresh-courses"]').first.click(); settle(frame)
    assert frame.locator('.rayon-head').count() >= 4
    frame.locator('#manual-form input').fill('2 pièces Citrons démo')
    frame.locator('#manual-form button').click(); settle(frame)
    row = frame.locator('.shopping-row').filter(has_text='Citrons démo')
    row.locator('[data-action="toggle-check"]').click(); settle(frame)
    expect(frame.locator('.shopping-row.is-bought').filter(has_text='Citrons démo')).to_be_visible()
    return current(frame)

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
origin = f'http://127.0.0.1:{server.server_port}'

try:
    with sync_playwright() as playwright, TemporaryDirectory(prefix='km-autonome-') as profile:
        def launch():
            ctx = playwright.chromium.launch_persistent_context(profile, executable_path='/usr/bin/chromium',
                headless=True, args=['--no-sandbox'], viewport={'width': 1280, 'height': 900})
            def guard(route):
                if not route.request.url.startswith(origin + '/'):
                    if route.request.url.startswith(('https://unpkg.com/@floating-ui/', 'https://unpkg.com/lucide@')):
                        report['previewHostResourcesBlockedByTest'].append(route.request.url)
                    else:
                        report['externalAppRequests'].append(route.request.url)
                    route.abort()
                else:
                    route.continue_()
            ctx.route('http://**/*', guard)
            ctx.route('https://**/*', guard)
            return ctx

        context = launch()
        page = context.new_page()
        page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
        try:
            page.goto(ARTIFACT.as_uri(), timeout=10000)
            report['directFileOpening'] = {'status': 'opened', 'url': page.url}
        except Exception as error:
            report['directFileOpening'] = {'status': 'blocked', 'reason': str(error).split('Call log:')[0].strip()}
            assert 'ERR_BLOCKED_BY_ADMINISTRATOR' in str(error), str(error)
        page.close()
        page = context.new_page()
        page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))

        def startup():
            page.goto(origin + '/demo.html')
            expect(page.locator('#sync-status')).to_have_text('Test local')
            assert page.evaluate("!('KM_STAGING_CONFIG' in window)")
            assert page.evaluate('navigator.serviceWorker.getRegistrations().then(r=>r.length)') == 0
            assert page.locator('script[src]').count() == 0
            reference_styles.update(page.evaluate(STYLE_SNAPSHOT))
        record('Fichier autonome complet : ouverture HTTP du même document, aucun module externe', startup)
        saved = {}
        def flows():
            saved.update(exercise(page))
        record('Recherche, favoris, fiche, portions, planning et courses cochées', flows)

        def persist():
            global context, page
            page.reload()
            expect(page.locator('#sync-status')).to_have_text('Test local')
            assert current(page) == saved
            context.close()
            context = launch(); page = context.new_page(); page.goto(origin + '/demo.html')
            expect(page.locator('#sync-status')).to_have_text('Test local')
            assert current(page) == saved
            page.locator('#lot0-reset').click()
            page.locator('#overlay [data-action="close-modal"]').first.click()
            assert current(page) == saved
            page.locator('#lot0-reset').click(); page.locator('#lot0-confirm-reset').click()
            expect(page.locator('#overlay [role="dialog"]')).to_have_count(0)
            assert len(current(page)['plan']) == 3
        record('Persistance HTTP après fermeture complète et réinitialisation confirmée', persist)

        def csp():
            page.evaluate("""() => { window.violations=[]; document.addEventListener('securitypolicyviolation',e=>violations.push(e.effectiveDirective)); }""")
            assert page.evaluate("fetch('https://example.invalid/km-demo').then(()=>false,()=>true)")
            page.evaluate("""() => { try { new Worker('data:text/javascript,postMessage(1)'); } catch {} }""")
            assert page.evaluate("""async () => { await new Promise(r=>setTimeout(r,50)); return violations.includes('connect-src')&&violations.includes('worker-src'); }""")
            assert report['externalAppRequests'] == []
        record('CSP embarquée : fetch et workers bloqués avant toute sortie réseau', csp)

        def preview():
            preview_page = context.new_page()
            preview_page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
            preview_page.goto(origin + '/preview.html')
            expect(preview_page.frame_locator('#codex-visualization').locator('#sync-status')).to_have_text('Session de test')
            frame = preview_page.locator('#codex-visualization').element_handle().content_frame()
            assert frame.evaluate(STYLE_SNAPSHOT) == reference_styles, json.dumps({'reference':reference_styles,'preview':frame.evaluate(STYLE_SNAPSHOT)}, ensure_ascii=False)
            expect(frame.locator('#km-demo-storage')).to_contain_text('Sauvegarde indisponible')
            exercise(frame)
            assert frame.locator('#km-v2-preview').count() == 1
            frame.locator('.nav-button[data-view="library"]').click()
            assert frame.evaluate('UI.view') == 'library'
            expect(frame.locator('.library-intro')).to_be_visible()
            frame.evaluate("document.getElementById('km-v2-preview').scrollTo(0,0)")
            preview_page.screenshot(path=str(OUTPUT / 'apercu-ordinateur.png'))
            preview_page.set_viewport_size({'width': 430, 'height': 900})
            frame.locator('.nav-button[data-view="planning"]').click()
            expect(frame.locator('.meal-card')).to_have_count(4)
            preview_page.screenshot(path=str(OUTPUT / 'apercu-mobile.png'))
            preview_page.close()
        if PREVIEW.exists():
            record('Aperçu interactif sandboxé : styles V2 identiques, vrais parcours sans stockage, ordinateur et mobile', preview)
        else:
            report['scenarios'].append({'name':'Aperçu interactif sandboxé', 'status':'not-run', 'reason':'Enveloppe de prévisualisation non fournie à ce banc de test.'})

        def denied_storage():
            denied = context.new_page()
            denied.add_init_script("Storage.prototype.setItem=function(){throw new DOMException('Test quota','QuotaExceededError')}")
            denied.goto(origin + '/demo.html')
            expect(denied.locator('#sync-status')).to_have_text('Test local')
            denied.locator('.nav-button[data-view="planning"]').click()
            before = current(denied)['plan'][0]['portions']
            denied.locator('[data-action="meal-portions"][data-delta="1"]').first.click()
            assert current(denied)['plan'][0]['portions'] == before + 1
            expect(denied.locator('#sync-status')).to_have_text('Session de test')
            expect(denied.locator('#km-demo-storage')).to_contain_text('Sauvegarde indisponible')
            denied.close()
        record('Stockage refusé : mode mémoire utilisable et avertissement visible', denied_storage)
        context.close()
finally:
    server.shutdown(); server.server_close()
    (OUTPUT / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))
