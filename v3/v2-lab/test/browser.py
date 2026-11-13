"""Parcours réels Chromium ; serveur LOT 0 déjà lancé. Aucune dépendance applicative.
python v3/v2-lab/test/browser.py (Playwright Python + Chromium requis pour les tests).
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect
import json, os, time

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / 'reports'
REPORTS.mkdir(exist_ok=True)
URL = os.environ.get('KM_LOT0_TEST_URL', 'http://127.0.0.1:43820')
origin = urlsplit(URL)
assert origin.hostname == '127.0.0.1' and origin.scheme == 'http' and origin.port
results, external, errors, requests = [], [], [], []

def record(name, fn):
    start = time.monotonic()
    try:
        fn()
        results.append({'name': name, 'status': 'passed', 'durationMs': round((time.monotonic() - start) * 1000)})
    except Exception as err:
        results.append({'name': name, 'status': 'failed', 'error': str(err)})
        raise

def protect(context):
    def route_handler(route):
        target = urlsplit(route.request.url)
        if target.scheme not in ('http', 'https') or target.netloc != origin.netloc:
            external.append(route.request.url)
            route.abort()
        else:
            requests.append(target.path)
            route.continue_()
    context.route('**/*', route_handler)
    context.add_init_script("""window.lot0Violations=[];
      document.addEventListener('securitypolicyviolation', e => lot0Violations.push({directive:e.effectiveDirective,uri:e.blockedURI}));""")

def boot(page):
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL)
    expect(page.locator('#sync-status')).to_have_text('Test local')
    assert page.evaluate("typeof SYNC !== 'undefined' && SYNC?.ready && SYNC_CONNECTED")
    expect(page.locator('#auth-gate')).to_be_hidden()

def settle(page):
    page.evaluate('async () => { await SYNC_QUEUE; }')

def state(page):
    settle(page)
    return page.evaluate('STATE')

def nav(page, view):
    page.locator(f'.nav-button[data-view="{view}"]').click()

def capture(page, filename):
    page.evaluate('scrollTo(0, 0)')
    page.screenshot(path=str(REPORTS / filename), full_page=False, animations='disabled')

def close(page):
    page.locator('#overlay [data-action="close-modal"]').first.click()

def reset(page):
    page.locator('#lot0-reset').click()
    page.locator('#lot0-confirm-reset').click()
    expect(page.locator('#overlay [role="dialog"]')).to_have_count(0)

with sync_playwright() as playwright, TemporaryDirectory(prefix='km-lot0-browser-') as profile:
    context = playwright.chromium.launch_persistent_context(profile, executable_path='/usr/bin/chromium',
        headless=True, args=['--no-sandbox'], viewport={'width': 1440, 'height': 1000})
    protect(context)
    page = context.new_page()
    try:
        boot(page)
        seed = state(page)

        def baseline():
            assert page.locator('.nav-button').all_text_contents() == ['Recettes', 'Planning', 'Courses']
            assert len(seed['recipes']) == 11 and len(seed['plan']) == 3 and len(seed['favorites']) == 2
            expect(page.locator('[data-action="sign-out"]')).to_be_disabled()
            assert page.evaluate("!('KM_STAGING_CONFIG' in window)")
            assert page.evaluate('navigator.serviceWorker.getRegistrations().then(r => r.length)') == 0
            page.evaluate("""async () => {
              localStorage.setItem('kmv2-state-sentinel', 'original-favoris-personnalisations');
              localStorage.setItem('keskonmange:v3:app-sentinel', 'autre-prototype');
              const cache = await caches.open('kmv2-cache-sentinel');
              await cache.put('/lot0-sentinel', new Response('cache-original'));
            }""")
            capture(page, 'desktop-recettes.png')
        record('Interface V2, trois onglets, exemples indépendants et aucun compte Firebase', baseline)

        def search():
            page.locator('#show-out').check()
            assert page.locator('.recipe-card').count() == 11
            page.locator('#search-input').fill('poulet')
            assert page.locator('.recipe-card').count() >= 4
            assert all('poulet' in name.lower() for name in page.locator('.recipe-card h3').all_text_contents())
            page.locator('#search-input').fill('aucunplatxyz')
            assert page.locator('.recipe-card').count() == 0
            page.locator('#search-input').fill('')
            page.locator('[data-action="toggle-filters"]').click()
            expect(page.locator('.filters-panel')).to_be_visible()
            page.locator('[data-action="toggle-filters"]').click()
        record('Recherche, onze fiches avec hors saison, filtres et état sans résultat', search)

        def favorite():
            page.locator('.recipe-card [data-action="toggle-favorite"][data-id="lot0-recette-3"]').click()
            assert 'lot0-recette-3' in state(page)['favorites']
            page.reload(); expect(page.locator('#sync-status')).to_have_text('Test local')
            assert 'lot0-recette-3' in state(page)['favorites']
            page.locator('[data-action="toggle-favorites"]').click()
            assert page.locator('.recipe-card').count() == 3
            page.locator('[data-action="toggle-favorites"]').click()
        record('Favoris modifiables et conservés après rechargement', favorite)

        def details():
            page.locator('.recipe-card-main[data-id="lot0-recette-1"]').click()
            before = page.locator('.ingrow strong').first.inner_text()
            step_before = page.locator('.steps').inner_text()
            page.locator('[data-action="detail-portions"][data-delta="1"]').click()
            assert page.locator('.ingrow strong').first.inner_text() != before
            assert page.locator('.steps').inner_text() != step_before
            assert '{{q:' not in page.locator('.steps').inner_text()
            page.locator('[data-action="cook"]').click()
            expect(page.locator('.cook-step')).to_be_visible()
            page.locator('[data-action="cook-next"]').click()
            expect(page.locator('.counter').last).to_contain_text('Étape 2')
            page.locator('[data-action="cook-toggle-ings"]').click()
            expect(page.locator('.cook-ingredients')).to_be_visible()
            close(page)
            assert state(page)['recipes'] == seed['recipes']
        record('Fiche, portions, étapes quantitatives et mode cuisine V2', details)

        def planning():
            page.locator('.recipe-card-main[data-id="lot0-recette-1"]').click()
            page.locator('[data-action="add-to-plan"]').click()
            settle(page); nav(page, 'planning')
            assert page.locator('.meal-card').count() == 4
            first = state(page)['plan'][0]
            baseline_courses = state(page)['shopping']['generated']
            page.locator('[data-action="meal-portions"][data-delta="1"]').first.click()
            assert state(page)['plan'][0]['portions'] == first['portions'] + 1
            assert state(page)['shopping']['generated'] == baseline_courses
            page.locator('.meal-link').first.click()
            expect(page.locator('.detail-controls strong')).to_have_text(str(first['portions'] + 1))
            close(page)
            page.locator('.meal-cook').first.click()
            page.locator('[data-action="cook-portions"][data-delta="1"]').click()
            assert state(page)['plan'][0]['portions'] == first['portions'] + 2
            close(page)
            page.locator('[data-action="remove-meal"]').last.click()
            assert len(state(page)['plan']) == 3
            page.locator('[data-action="refresh-courses"]').first.click()
            settle(page)
            assert page.evaluate('JSON.stringify(STATE.shopping.generated) === JSON.stringify(calculateNeeds(STATE,PILOT_CATALOGUE))')
            assert state(page)['shopping']['overrides'] == seed['shopping']['overrides']
            assert state(page)['shopping']['purchased'] == seed['shopping']['purchased']
        record('Planning : ajout, retrait, portions, fiche et actualisation explicite des courses', planning)

        def shopping():
            page.locator('#manual-form input').fill('2 pièces Lessive test')
            page.locator('#manual-form button').click(); settle(page)
            page.locator('#manual-form input').fill('1 pièce Lessive test')
            page.locator('#manual-form button').click(); settle(page)
            row = page.locator('.shopping-row').filter(has=page.locator('.line-title', has_text='Lessive test'))
            assert row.count() == 1
            expect(row.locator('.line-sub')).to_contain_text('3 pièce')
            row.locator('[data-action="edit-course"]').click()
            page.locator('#course-quantity').fill('4')
            page.locator('#course-edit-form button[type="submit"]').click(); settle(page)
            row.locator('[data-action="edit-rayon"]').click()
            page.locator('#rayon-form select').select_option('droguerie')
            page.locator('#rayon-form button[type="submit"]').click(); settle(page)
            row.locator('[data-action="toggle-check"]').click(); settle(page)
            expected = page.evaluate("""() => {
              const rows=courseRows(STATE,PILOT_CATALOGUE);
              const pending=rows.filter(r=>r.type!=='purchased'&&!(r.type==='manual'&&r.checked));
              const done=rows.filter(r=>r.type==='purchased'||r.type==='manual'&&r.checked);
              return [pending,done].flatMap(items=>RAYONS.filter(([id])=>items.some(r=>r.rayon===id)).map(([,label])=>label));
            }""")
            headings = page.locator('.rayon-head').all_text_contents()
            assert len(headings) == len(expected) and all(label in title for label, title in zip(expected, headings))
            purchased = state(page)
            page.reload(); expect(page.locator('#sync-status')).to_have_text('Test local'); nav(page, 'courses')
            assert state(page) == purchased
            expect(page.locator('.shopping-row.is-bought').filter(has_text='Lessive test')).to_be_visible()
            capture(page, 'desktop-courses.png')
        record('Courses par rayons, regroupement manuel, quantité, rayon, coche et persistance', shopping)

        def clear():
            before = state(page)
            page.locator('[data-action="clear-courses-confirm"]').click(); close(page)
            assert state(page) == before
            page.locator('[data-action="clear-courses-confirm"]').click()
            page.locator('[data-action="clear-courses"]').click(); settle(page)
            assert page.locator('.shopping-row').count() == 0
            for field in ['recipes', 'plan', 'favorites', 'rayonOverrides']:
                assert state(page)[field] == before[field]
            page.locator('[data-action="refresh-courses"]').click(); settle(page)
            assert page.locator('.shopping-row').count() > 0
        record('Vider : confirmation, annulation, conservation des recettes et régénération', clear)

        def editing():
            nav(page, 'library')
            page.locator('.recipe-card-main[data-id="lot0-recette-1"]').click()
            page.locator('[data-action="edit-recipe"]').click()
            page.locator('#recipe-edit-form [name="nom"]').fill('Poulet personnalisé — test local')
            page.locator('#recipe-edit-form button[type="submit"]').click(); settle(page)
            expect(page.locator('.detail-title')).to_have_text('Poulet personnalisé — test local')
            assert state(page)['recipes'] != seed['recipes']
            page.locator('[data-action="edit-image"]').click()
            page.locator('#photo-url').fill('https://example.invalid/lot0-image.png')
            page.locator('#image-edit-form button[type="submit"]').click(); settle(page)
            expect(page.locator('.detail-cover img')).to_be_hidden()
            close(page)
            page.locator('[data-action="import-open"]').first.click()
            page.locator('[data-action="fill-sample"]').click()
            page.locator('[data-action="import-analyze"]').click()
            expect(page.locator('[data-action="import-confirm"]')).to_be_visible()
            close(page)
        record('Édition locale, photo externe bloquée avec repli V2 et aperçu d’import annulable', editing)

        def offline_and_tabs():
            other = context.new_page(); boot(other)
            nav(other, 'planning')
            before = state(page)['plan'][0]['portions']
            other.locator('[data-action="meal-portions"][data-delta="1"]').first.click()
            settle(other)
            nav(page, 'planning')
            expect(page.locator('.meal-card .stepper strong').first).to_have_text(str(before + 1))
            other.close()
            context.set_offline(True)
            page.locator('[data-action="meal-portions"][data-delta="1"]').first.click()
            assert state(page)['plan'][0]['portions'] == before + 2
            context.set_offline(False)
        record('Deux onglets locaux synchronisés et modifications possibles dans un onglet déjà chargé hors ligne', offline_and_tabs)

        def corrupt_recovery():
            page.evaluate("localStorage.setItem('keskonmange:v3:lot0:v2-exemples-lot0-1:state', 'sauvegarde de test illisible')")
            page.reload()
            expect(page.locator('#auth-gate')).to_contain_text('Sauvegarde locale illisible')
            assert page.evaluate("localStorage.getItem('keskonmange:v3:lot0:v2-exemples-lot0-1:state')") == 'sauvegarde de test illisible'
            page.locator('.gate-card button').click()
            expect(page.locator('#lot0-confirm-reset')).to_be_visible()
            page.locator('#lot0-confirm-reset').click()
            expect(page.locator('#overlay [role="dialog"]')).to_have_count(0)
            expect(page.locator('#auth-gate')).to_be_hidden()
            assert state(page) == seed
        record('Sauvegarde illisible conservée, récupération explicite limitée aux données de test', corrupt_recovery)

        def isolation():
            reset(page)
            assert state(page) == seed
            assert page.evaluate("localStorage.getItem('kmv2-state-sentinel')") == 'original-favoris-personnalisations'
            assert page.evaluate("localStorage.getItem('keskonmange:v3:app-sentinel')") == 'autre-prototype'
            assert page.evaluate("caches.open('kmv2-cache-sentinel').then(c=>c.match('/lot0-sentinel')).then(r=>r.text())") == 'cache-original'
            assert page.evaluate('navigator.serviceWorker.getRegistrations().then(r=>r.length)') == 0
            assert external == []
            assert not any('firebase-runtime' in path or 'firebase-config' in path or 'service-worker' in path or 'v3/engine' in path for path in requests)
            # URL de sonde inoffensive : jamais une adresse Firebase réelle.
            assert page.evaluate("fetch('https://example.invalid/lot0-probe').then(()=>false,()=>true)")
            page.evaluate("""() => {
              try { new Worker('/core.mjs'); } catch {}
              try { new WebSocket('wss://example.invalid/lot0-probe'); } catch {}
              try { navigator.sendBeacon('https://example.invalid/lot0-probe','test'); } catch {}
            }""")
            assert page.evaluate("""async () => {
              await new Promise(resolve => setTimeout(resolve, 50));
              return lot0Violations.some(v=>v.directive==='connect-src') && lot0Violations.some(v=>v.directive==='worker-src');
            }""")
            assert external == []
        record('Réinitialisation limitée au test, caches préservés et CSP bloque réseau/worker', isolation)

        def reopened():
            global context, page
            nav(page, 'planning')
            page.locator('[data-action="meal-portions"][data-delta="1"]').first.click()
            expected = state(page)
            context.close()
            context = playwright.chromium.launch_persistent_context(profile, executable_path='/usr/bin/chromium',
                headless=True, args=['--no-sandbox'], viewport={'width': 1440, 'height': 1000})
            protect(context); page = context.new_page(); boot(page)
            assert state(page) == expected
            assert page.evaluate("localStorage.getItem('kmv2-state-sentinel')") == 'original-favoris-personnalisations'
        record('Fermeture complète puis réouverture : planning et personnalisations conservés', reopened)

        def mobile():
            for width in [320, 390]:
                mobile_context = playwright.chromium.launch_persistent_context(str(Path(profile) / f'mobile-{width}'),
                    executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'],
                    viewport={'width': width, 'height': 844}, is_mobile=True, has_touch=True,
                    device_scale_factor=2)
                protect(mobile_context); phone = mobile_context.new_page(); boot(phone)
                assert phone.evaluate('document.documentElement.scrollWidth <= innerWidth')
                phone.locator('.recipe-card-main').first.tap()
                phone.locator('[data-action="detail-portions"][data-delta="1"]').tap()
                expect(phone.locator('.detail-columns')).to_be_visible()
                close(phone); nav(phone, 'planning')
                phone.locator('[data-action="meal-portions"][data-delta="1"]').first.tap(); settle(phone)
                phone.locator('[data-action="refresh-courses"]').first.tap(); settle(phone)
                expect(phone.locator('#manual-form')).to_be_visible()
                phone.locator('#manual-form input').fill('2 savons mobile test')
                phone.locator('#manual-form button').tap(); settle(phone)
                row = phone.locator('.shopping-row').filter(has_text='savons mobile test')
                row.locator('[data-action="toggle-check"]').tap(); settle(phone)
                expect(phone.locator('.shopping-row.is-bought').filter(has_text='savons mobile test')).to_be_visible()
                assert phone.evaluate('document.documentElement.scrollWidth <= innerWidth')
                capture(phone, f'mobile-{width}-courses.png')
                nav(phone, 'library')
                if width == 390: capture(phone, 'mobile-390-recettes.png')
                mobile_context.close()
        record('Mobile tactile 320 et 390 px : fiches, portions, planning, courses et coches', mobile)

        def no_errors():
            assert not errors, errors
            assert not external, external
        record('Aucune erreur JavaScript non traitée et aucune requête externe émise', no_errors)
    finally:
        context.close()
        report = {'browser': 'Chromium / Linux', 'realIPhoneSafariTested': False,
            'results': results, 'externalRequests': external, 'pageErrors': errors,
            'requestedLocalPaths': sorted(set(requests))}
        (REPORTS / 'browser-tests.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps(report, ensure_ascii=False, indent=2))
