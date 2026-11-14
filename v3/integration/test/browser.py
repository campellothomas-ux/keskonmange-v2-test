"""Parcours de l’application complète. Prix et réponses simulées EXCLUSIVEMENT de test.
Les consultations réelles et leurs blocages font l’objet d’un rapport distinct.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright, expect
import json,time

LAB=Path(__file__).resolve().parents[1]
REPORTS=LAB/'reports';REPORTS.mkdir(exist_ok=True)
URL='http://127.0.0.1:43830'
KEY='keskonmange:v3:integrated:1'
seed=json.loads((LAB/'test/fixtures/synthetic-state.json').read_text())
results=[];external=[];errors=[];mock_requests=[]
def record(name,fn):
    start=time.monotonic()
    try:fn();results.append({'name':name,'status':'passed','durationMs':round((time.monotonic()-start)*1000)})
    except Exception as ex:results.append({'name':name,'status':'failed','error':str(ex)});raise

def state(page):
    page.evaluate('async()=>{await SYNC_QUEUE;}')
    return page.evaluate('STATE')

def nav(page,view):page.locator(f'.nav-button[data-view="{view}"]').click()
def close(page):page.locator('#overlay [data-action="close-modal"]').first.click()
def ready(page):expect(page.locator('#sync-status')).to_have_text('Local · V3')
def product_for(s,id):return next(p['id'] for p in s['v3']['privateProducts'] if s['v3']['bindings'][p['id']]['ingredientId']==id)

def protect(context):
    def route(r):
        u=r.request.url
        if u.startswith(URL+'/'):r.continue_()
        else:external.append(u);r.abort()
    context.route('http://**/*',route);context.route('https://**/*',route)

with sync_playwright() as p,TemporaryDirectory(prefix='km-v3-full-') as profile:
    def launch():
        context=p.chromium.launch_persistent_context(profile,executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'],viewport={'width':1440,'height':1000})
        protect(context)
        context.add_init_script('''if(location.origin===%s&&!localStorage.getItem(%s)){localStorage.setItem(%s,%s);localStorage.setItem('kmv2-original-sentinel','favoris-et-personnalisations-V2');}'''%(json.dumps(URL),json.dumps(KEY),json.dumps(KEY),json.dumps(json.dumps(seed))))
        return context
    context=launch();page=context.new_page();page.on('pageerror',lambda ex:errors.append(str(ex)))
    try:
        page.goto(URL);ready(page)
        def shell():
            assert page.locator('.nav-button').all_text_contents()==['Planning','Courses','Recettes','Profil']
            expect(page.locator('.nav-button[data-view="planning"]')).to_have_class('nav-button active')
            assert len(state(page)['recipes'])==98
            assert page.evaluate("!('KM_STAGING_CONFIG' in window)")
            assert page.evaluate('navigator.serviceWorker.getRegistrations().then(x=>x.length)')==0
            nav(page,'library');page.locator('#show-out').check();assert page.locator('.recipe-card').count()==98
            page.locator('#search-input').fill('quiche');assert page.locator('.recipe-card').count()>=1
            page.locator('#search-input').fill('');page.screenshot(path=str(REPORTS/'v3-recettes-desktop.png'))
        record('V2 reconnaissable, quatre onglets ordonnés, accueil Planning et 98 recettes',shell)

        def menu():
            page.locator('#km3-generator [name="budget"]').fill('100')
            page.locator('#km3-generator [name="meals"]').fill('7')
            page.locator('#km3-generator button[type="submit"]').click()
            expect(page.locator('[data-action="v3-proposal-accept"]')).to_be_visible(timeout=30000)
            assert state(page)['plan']==[]
            assert 'paniers comparés' in page.locator('#overlay').inner_text()
            choices=page.locator('#overlay .line-title').all_text_contents()
            page.locator('[data-action="v3-proposal-replace"]').first.click()
            updated=page.locator('#overlay .line-title').all_text_contents()
            assert updated[0]!=choices[0] and updated[1:]==choices[1:]
            assert state(page)['plan']==[]
            page.locator('[data-action="v3-proposal-accept"]').click();state(page)
            expect(page.locator('.meal-card')).to_have_count(7)
            assert len(state(page)['plan'])==7
            page.locator('[data-action="meal-portions"][data-delta="1"]').first.click()
            assert state(page)['plan'][0]['portions']==3
            page.locator('[data-action="v3-move"][data-delta="-1"]').nth(1).click();state(page)
            page.locator('.meal-link').first.click();expect(page.locator('.detail-columns')).to_be_visible();close(page)
            page.screenshot(path=str(REPORTS/'v3-planning-desktop.png'))
        record('Menu de sept repas : comparaison réelle du moteur, confirmation, portions et réorganisation',menu)

        def manual():
            nav(page,'courses')
            for article in ['2 bananes','fromage blanc','biscuits']:
                page.locator('#km3-manual input').fill(article);page.locator('#km3-manual button').click();state(page)
                if page.locator('[data-action="v3-manual-separate"]').count():page.locator('[data-action="v3-manual-separate"]').click();state(page)
            assert len(state(page)['shopping']['manual'])==3
            rows=page.locator('.shopping-row');assert rows.count()>3
            rows.first.locator('[data-action="v3-check"]').click();state(page)
            assert len(state(page)['v3']['checked'])==1
            row=page.locator('.shopping-row').filter(has_text='biscuits').last
            row.locator('[data-action="v3-row"]').click()
            page.locator('#km3-row [name="unitPrice"]').fill('15')
            page.locator('#km3-row button[type="submit"]').click();state(page)
            assert next(m for m in state(page)['shopping']['manual'] if m['nom']=='biscuits')['unitPriceCents']==1500
            page.screenshot(path=str(REPORTS/'v3-courses-desktop.png'))
            # Déclencher un dépassement certain, sans supposer le montant du menu.
            raw=page.locator('.km3-metrics .line-card').nth(1).locator('strong').inner_text()
            known=float(''.join(c for c in raw if c.isdigit() or c in ',.').replace(',','.'))
            nav(page,'profile');page.locator('#km3-profile [name="budget"]').fill(f'{max(0.01,known-5):.2f}');page.locator('#km3-profile button[type="submit"]').click();state(page);nav(page,'courses')
            before=state(page)['plan'];page.locator('[data-action="v3-reoptimize"]').click()
            expect(page.locator('[data-action="v3-proposal-accept"]')).to_be_visible(timeout=30000)
            assert state(page)['plan']==before
            close(page)
        record('Panier global : bananes, fromage blanc, biscuits, prix manuel, coche et réoptimisation sans remplacement automatique',manual)

        def pdf_receipt():
            nav(page,'profile');page.locator('[data-action="v3-ticket-open"]').click()
            page.locator('#km3-ticket-file input').set_input_files(str(LAB/'test/fixtures/ticket-synthetique.pdf'))
            page.locator('#km3-ticket-file button').click()
            expect(page.locator('#km3-ticket-review')).to_be_visible(timeout=30000)
            assert 'pdf_text' in page.locator('#overlay').inner_text()
            assert len(state(page)['v3']['receipts'])==0
            ids=['i_riz_basmati','i_lait','i_yaourt_grec_nature']
            for k,id in enumerate(ids):page.locator(f'[name="line-product-{k}"]').select_option(product_for(seed,id))
            discount_options=page.locator('[name="line-product-4"] option').all_text_contents()
            page.locator('[name="line-product-4"]').select_option(label='BISCUITS')
            page.locator('[name="confirm"]').check()
            page.locator('#km3-ticket-review button[type="submit"]').click();state(page)
            assert len(state(page)['v3']['receipts'])==1
            obs=[o for o in state(page)['v3']['observations'] if o.get('receiptId')]
            assert sorted(o['cents'] for o in obs)==[120,180,250]
            assert len(obs)==3
        record('PDF textuel lu localement, remise affectée, trois prix historiques enregistrés seulement après confirmation',pdf_receipt)

        def image_receipt():
            page.locator('[data-action="v3-ticket-open"]').click();page.locator('#km3-ticket-file input').set_input_files(str(LAB/'test/fixtures/ticket-synthetique.png'))
            page.locator('#km3-ticket-file button').click()
            expect(page.locator('#km3-ticket-review')).to_be_visible(timeout=45000)
            assert 'image_ocr' in page.locator('#overlay').inner_text()
            assert page.locator('.km3-receipt-row').count()>=4
            assert len(state(page)['v3']['receipts'])==1
            page.locator('[name="line-name-0"]').fill('NOM CORRIGÉ PAR LE FOYER')
            page.screenshot(path=str(REPORTS/'v3-ticket-review.png'))
            close(page)
            assert len(state(page)['v3']['receipts'])==1
        record('OCR réel de l’image : correction possible, annulation sans enregistrement ni envoi extérieur',image_receipt)

        def scanned_pdf():
            page.locator('[data-action="v3-ticket-open"]').click()
            page.locator('#km3-ticket-file input').set_input_files(str(LAB/'test/fixtures/ticket-synthetique-scan.pdf'))
            page.locator('#km3-ticket-file button').click()
            expect(page.locator('#km3-ticket-review')).to_be_visible(timeout=45000)
            assert 'pdf_ocr' in page.locator('#overlay').inner_text()
            assert page.locator('.km3-receipt-row').count()>=4
            assert len(state(page)['v3']['receipts'])==1
            close(page)
        record('PDF scanné : rendu PDF local, OCR effectif et vérification sans enregistrement automatique',scanned_pdf)

        def sources_mocked():
            nav(page,'profile');page.locator('[name="allowOpenData"]').check();page.locator('#km3-profile button[type="submit"]').click();state(page)
            def api(r):
                mock_requests.append({'url':r.request.url,'method':r.request.method,'synthetic':True})
                assert r.request.method=='GET' and not r.request.post_data
                if 'world.openfoodfacts.org' in r.request.url:data={'status':1,'product':{'code':'3017620422003','product_name':'Riz API SYNTHÉTIQUE DE TEST','quantity':'500 g','brands':'TEST'}}
                elif '/products/' in r.request.url:data={'items':[{'code':'3017620422003','product_name':'Riz API SYNTHÉTIQUE DE TEST','quantity':'500 g','price_count':1}]}
                else:data={'items':[{'id':987654,'product_code':'3017620422003','price':'1.50','currency':'EUR','date':seed['v3']['observations'][0]['date'],'location':{'osm_name':'MAGASIN API FICTIF'},'price_is_discounted':False}]}
                r.fulfill(status=200,content_type='application/json',headers={'access-control-allow-origin':'*'},body=json.dumps(data))
            context.route('https://world.openfoodfacts.org/**',api);context.route('https://prices.openfoodfacts.org/**',api)
            page.locator('[data-action="v3-public-search"]').click();page.locator('#km3-public-search [name="query"]').fill('riz');page.locator('#km3-public-search button').click()
            expect(page.locator('[data-action="v3-open-product"]')).to_be_visible(timeout=20000)
            page.locator('[data-action="v3-open-product"]').click();expect(page.locator('#km3-product')).to_be_visible(timeout=20000)
            page.locator('#km3-product [name="ingredientId"]').select_option('i_riz_basmati');page.locator('#km3-product [name="confirmed"]').check();page.locator('#km3-product button[type="submit"]').click();state(page)
            assert state(page)['v3']['bindings']['off-3017620422003']['amount']=='500'
            assert len(state(page)['v3']['public']['observations'])==1
        record('Parcours des connecteurs avec réponses SIMULÉES de contrat, distinct du test réseau réel bloqué',sources_mocked)

        saved=state(page)
        def persistence():
            global context,page
            context.close();context=launch();page=context.new_page();page.goto(URL);ready(page)
            assert state(page)==saved
            assert page.evaluate("localStorage.getItem('kmv2-original-sentinel')")=='favoris-et-personnalisations-V2'
            assert len(state(page)['v3']['receipts'])==1
            page.set_viewport_size({'width':390,'height':844});nav(page,'courses')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.screenshot(path=str(REPORTS/'v3-courses-mobile.png'))
            nav(page,'library');page.screenshot(path=str(REPORTS/'v3-recettes-mobile.png'))
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        record('Fermeture et reprise : budget, achats, coches, prix, historique, préférences ; mobile sans débordement',persistence)

        def correct_history():
            nav(page,'profile');page.locator('[data-action="v3-ticket-edit"]').click()
            page.locator('[name="line-name-0"]').fill('RIZ CORRIGÉ')
            page.locator('[name="confirm"]').check()
            page.locator('#km3-ticket-review button[type="submit"]').click();state(page)
            assert len(state(page)['v3']['receipts'])==1
            assert state(page)['v3']['receipts'][0]['lines'][0]['name']=='RIZ CORRIGÉ'
            assert len([o for o in state(page)['v3']['observations'] if o.get('receiptId')])==3
            page.locator('[data-action="v3-ticket-delete"]').click()
            page.locator('[data-action="v3-ticket-delete-confirm"]').click();state(page)
            assert len(state(page)['v3']['receipts'])==0
            assert not [o for o in state(page)['v3']['observations'] if o.get('receiptId')]
        record('Historique : correction confirmée sans doublon puis suppression effective des observations du ticket',correct_history)

        def safety():
            assert not errors,errors
            assert not external,external
            assert all('firebase' not in x['url'] for x in mock_requests)
        record('Aucune initialisation Firebase, aucune erreur non traitée, aucun transfert de ticket',safety)
    finally:
        context.close()
        report={'results':results,'externalRequestsBlockedUnexpectedly':external,'pageErrors':errors,'mockRequests':mock_requests,
            'economicData':'SYNTHETIC_TESTS_ONLY','realPricesVerifiedByThisSuite':False,'macSafariTested':False}
        (REPORTS/'browser-tests.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2))
