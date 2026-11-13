"""Real Chromium interactions. Run npm run build, npm start, then this file.
Uses the environment's installed Python Playwright and Chromium, no app dependency.
"""
from pathlib import Path
from tempfile import mkdtemp
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect
import json, os, re, time

ROOT=Path(__file__).resolve().parents[1]
REPORTS=ROOT/'reports'
REPORTS.mkdir(exist_ok=True)
URL=os.environ.get('KM_TEST_URL','http://127.0.0.1:4173')
catalog=json.loads((ROOT/'../library/data/library-v3.json').read_text())
recipes={r['library']['sourceIndex']:r for r in catalog['recipes']}
results=[]; errors=[]; external=[]

def record(name,fn):
    start=time.monotonic()
    try:fn();results.append({'name':name,'status':'passed','durationMs':round((time.monotonic()-start)*1000)})
    except Exception as error:
        results.append({'name':name,'status':'failed','detail':str(error)})
        page.screenshot(path=str(REPORTS/'browser-failure.png'),full_page=False)
        (REPORTS/'browser-tests.json').write_text(json.dumps({'status':'failed','tests':results},ensure_ascii=False,indent=2)+'\n')
        raise

def watch(page):
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('request',lambda request:external.append(request.url) if urlsplit(request.url).scheme in ('http','https') and urlsplit(request.url).netloc!=urlsplit(URL).netloc else None)

def open_recipe(index):
    page.locator(f'[data-recipe-card="{recipes[index]["id"]}"] .recipe-open').click()
    expect(page.locator('#recipe-dialog')).to_be_visible()

def nav(view):page.locator(f'.navigation:visible [data-view="{view}"]').click()

def checked_state():return page.evaluate('JSON.parse(localStorage.getItem("keskonmange:v3:lot5"))')

with sync_playwright() as p:
    profile=mkdtemp(prefix='km-lot5-browser-')
    def launch(profile,viewport,mobile=False):
        return p.chromium.launch_persistent_context(profile,executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),
          headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],viewport=viewport,is_mobile=mobile,has_touch=mobile)
    context=launch(profile,{'width':1440,'height':1000})
    page=context.pages[0];watch(page);page.goto(URL);expect(page.locator('.recipe-card')).to_have_count(50)

    def search():
        expect(page.locator('#result-count')).to_have_text('50 recettes')
        page.locator('#recipe-search').fill('QUICHE');expect(page.locator('.recipe-card')).to_have_count(1)
        page.locator('#recipe-search').fill('zzzintrouvable');expect(page.get_by_text('Aucune recette trouvée',exact=True)).to_be_visible()
        page.get_by_role('button',name='Voir les 50 recettes',exact=True).click();expect(page.locator('.recipe-card')).to_have_count(50)
        page.get_by_role('button',name='25 min ou moins',exact=True).click()
        assert 10<page.locator('.recipe-card').count()<50
        page.get_by_role('button',name='Végétarien',exact=True).click()
        assert page.locator('.recipe-card').count()>=8
        page.get_by_role('button',name='Tout',exact=True).click()
        page.screenshot(path=str(REPORTS/'desktop-recipes.png'),full_page=False)
    record('Recherche, ingrédients, filtres et état vide parmi 50 recettes',search)

    def batch():
        open_recipe(68)
        expect(page.locator('.quantity-notice')).to_contain_text('4 parts préparées pour 2 personnes')
        for _ in range(3):page.locator('[data-action="detail-plus"]').click()
        expect(page.locator('.quantity-notice')).to_contain_text('8 parts préparées pour 5 personnes')
        expect(page.locator('.ingredient-list')).to_contain_text('2 pâtes brisées')
        expect(page.locator('.ingredient-list')).to_contain_text('200 g de salade verte')
        page.locator('[data-action="save-recipe"]').click()
        assert len(checked_state()['menu']['meals'])==1
    record('Quiche entière, accompagnement indépendant et sélection manuelle pour cinq',batch)

    def planning_ten():
        for index in [4,6,7,8,15,16,37,53,83]:
            open_recipe(index)
            if index==53:
                expect(page.locator('.adjustment-note')).to_be_visible()
                expect(page.locator('.ingredient-list')).to_contain_text('180 g de pates')
                page.locator('.source-details summary').click()
                expect(page.locator('.audit-adjustment')).to_contain_text('350 → 270 g')
            page.locator('[data-action="save-recipe"]').click()
        nav('planning');expect(page.locator('.meal-row')).to_have_count(10)
        page.screenshot(path=str(REPORTS/'desktop-planning.png'),full_page=False)
    record('Planning de dix repas, quantité ajustée visible et original conservé',planning_ten)

    def shopping_and_portions():
        nav('courses');snapshot=checked_state()
        onion=next(r for r in snapshot['shopping']['calculated'] if r.get('ingredientId')=='i_oignon')
        assert onion['referenceNeed']=='7/2' and onion['purchaseQuantity']['amount']=='4'
        potato=next(r for r in snapshot['shopping']['calculated'] if r.get('ingredientId')=='i_patates_douces')
        assert potato['quantity']['amount']=='750'
        page.locator(f'[data-shopping-row="{potato["id"]}"] input').check()
        nav('planning');burger=page.locator('.meal-row').filter(has_text=recipes[15]['name'])
        burger.locator('[data-action="meal-plus"]').click()
        burger.locator('.meal-title').click()
        expect(page.locator('.cooking-steps')).to_contain_text('1 ½ c. à soupe')
        page.locator('[data-action="close-recipe"]').click()
        nav('courses');expect(page.locator('.reconciliation')).to_contain_text('975 g')
        before=checked_state();old=next(r for r in before['shopping']['calculated'] if r['id']==potato['id']);assert old['quantity']['amount']=='750' and old['checked']
        page.locator('[data-action="acknowledge-shopping"]').click()
        after=checked_state();new=next(r for r in after['shopping']['calculated'] if r['id']==potato['id']);assert new['quantity']['amount']=='975' and new['checked']
        expect(page.locator('.reconciliation')).to_have_count(0)
        expect(page.locator('.price-status')).to_contain_text('Inconnu')
    record('Agrégation exacte, portions, huile synchronisée et protection des courses cochées',shopping_and_portions)

    def manual():
        page.locator('#manual-label').fill('Liquide vaisselle');page.locator('#manual-quantity').fill('1 flacon')
        page.locator('#manual-form button').click()
        row=page.locator('.shopping-row').filter(has_text='Liquide vaisselle');row.locator('input').check()
        expect(row.locator('input')).to_be_checked()
        expect(row.locator('input')).to_be_focused()
        row.locator('input').press('Space');expect(row.locator('input')).not_to_be_checked()
        row.locator('input').press('Space');expect(row.locator('input')).to_be_checked()
        page.locator('#manual-label').fill('<img src=x onerror="window.bad=true">');page.locator('#manual-form button').click()
        assert page.locator('.shopping-row img').count()==0
        assert not page.evaluate('Boolean(window.bad)')
        page.locator('.shopping-row').filter(has_text='<img src=x').locator('[data-action="remove-manual"]').click()
        page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(REPORTS/'desktop-shopping.png'),full_page=False)
    record('Articles manuels, cases conservées, suppression et texte libre échappé',manual)

    def ideas():
        nav('suggestions');expect(page.locator('.suggestions-waiting')).to_be_visible()
        assert len(checked_state()['menu']['meals'])==10
        for _ in range(3):page.locator('[data-action="suggestion-plus"]').click()
        expect(page.locator('.suggestions-waiting')).to_be_visible()
        page.locator('[data-action="request-suggestions"]').click();expect(page.locator('.suggestions-grid .recipe-card')).to_have_count(6)
        assert len(checked_state()['menu']['meals'])==10
        assert page.locator(f'.suggestions-grid [data-recipe-card="{recipes[68]["id"]}"]').count()==0
        page.locator('[data-action="add-idea"]').first.click()
        assert len(checked_state()['menu']['meals'])==11
    record('Suggestions sur demande uniquement et ajout après choix explicite',ideas)

    def offline():
        context.set_offline(True);nav('planning');expect(page.locator('.meal-row')).to_have_count(11)
        nav('courses');expect(page.locator('.shopping-row').filter(has_text='Liquide vaisselle').locator('input')).to_be_checked()
        context.set_offline(False)
    record('Navigation, calculs et cases sans connexion après chargement',offline)
    context.close()

    context=launch(profile,{'width':1440,'height':1000});page=context.pages[0];watch(page);page.goto(URL)
    def restore():
        nav('planning');expect(page.locator('.meal-row')).to_have_count(11)
        burger=page.locator('.meal-row').filter(has_text=recipes[15]['name']);expect(burger.locator('.stepper strong')).to_have_text('3')
        nav('courses');expect(page.locator('.shopping-row').filter(has_text='Liquide vaisselle').locator('input')).to_be_checked()
        row=next(r for r in checked_state()['shopping']['calculated'] if r.get('ingredientId')=='i_patates_douces');assert row['checked']
    record('Reprise après fermeture complète puis réouverture de Chromium',restore)
    def multi_tab():
        other=context.new_page();watch(other);other.goto(URL)
        other.locator('.navigation:visible [data-view="courses"]').click()
        other.locator('#manual-label').fill('Article de l’autre onglet');other.locator('#manual-form button').click()
        expect(page.get_by_role('alert')).to_contain_text('autre onglet')
        page.locator('#manual-label').fill('Écriture obsolète');page.locator('#manual-form button').click()
        assert all(r['label']!='Écriture obsolète' for r in checked_state()['shopping']['manual'])
        page.locator('[data-action="reload"]').click();nav('courses')
        expect(page.locator('.shopping-row').filter(has_text='Article de l’autre onglet')).to_be_visible()
        other.close()
    record('Un autre onglet ne peut pas être écrasé par une page devenue obsolète',multi_tab)
    context.close()

    mobile_profile=mkdtemp(prefix='km-lot5-mobile-')
    context=launch(mobile_profile,{'width':390,'height':844},True);page=context.pages[0];watch(page);page.goto(URL)
    def mobile():
        expect(page.locator('.recipe-card')).to_have_count(50)
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        nav_box=page.locator('.navigation:visible').bounding_box();assert nav_box['y']>700
        expect(page.locator('.brand')).to_be_visible()
        page.screenshot(path=str(REPORTS/'mobile-recipes.png'),full_page=False)
        page.locator('#recipe-search').fill('burger');open_recipe(15)
        expect(page.locator('.cooking-steps')).to_contain_text('1 c. à soupe')
        assert not page.evaluate('document.querySelector("dialog").scrollWidth>document.querySelector("dialog").clientWidth')
        page.screenshot(path=str(REPORTS/'mobile-recipe.png'),full_page=False)
        page.locator('[data-action="save-recipe"]').click();nav('planning')
        expect(page.locator('.meal-row')).to_have_count(1)
        page.locator('[data-action="remove-meal"]').click();expect(page.get_by_text('La semaine est à vous',exact=True)).to_be_visible()
        nav('courses');expect(page.get_by_text('Une liste qui se fait toute seule',exact=True)).to_be_visible()
        page.locator('#manual-label').fill('Pain');page.locator('#manual-quantity').fill('1 pièce');page.locator('#manual-form button').click()
        page.locator('.shopping-row').filter(has_text='Pain').locator('input').check();page.reload();nav('courses')
        expect(page.locator('.shopping-row').filter(has_text='Pain').locator('input')).to_be_checked()
        page.screenshot(path=str(REPORTS/'mobile-shopping.png'),full_page=False)
        for width in [320,375,768]:
            page.set_viewport_size({'width':width,'height':844});nav('recipes')
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),f'overflow at {width}'
        page.set_viewport_size({'width':390,'height':844})
    record('Mobile 320/375/390 px, tablette 768 px, fiche, suppression, courses et rechargement',mobile)

    def save_error():
        page.evaluate('() => { Storage.prototype.setItem=function(){throw new DOMException("Quota dépassé", "QuotaExceededError")}; }')
        nav('courses');page.locator('#manual-label').fill('Sel');page.locator('#manual-form button').click()
        expect(page.get_by_role('alert')).to_contain_text('sauvegarde est indisponible')
        expect(page.locator('.local-status')).to_contain_text('Non enregistré')
    record('Échec de sauvegarde visible, sans faux statut enregistré',save_error)
    context.close()
    assert not errors,errors
    assert not external,external
    results.append({'name':'Aucune erreur JavaScript ni requête externe de l’application','status':'passed'})

report={'browser':'Chromium via Python Playwright','url':URL,'status':'passed','tests':results,
        'counts':{'passed':len(results),'failed':0},'javascriptErrors':errors,'externalRequests':external,
        'directFileOpen':{'status':'blocked_by_managed_browser_policy','error':'ERR_BLOCKED_BY_ADMINISTRATOR',
          'note':'Politique URLBlocklist du navigateur géré : file:// non autorisé. Aucun contournement ; même HTML testé via HTTP local.'}}
(REPORTS/'browser-tests.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':len(results),'failed':0,'javascriptErrors':errors,'externalRequests':external},ensure_ascii=False))
