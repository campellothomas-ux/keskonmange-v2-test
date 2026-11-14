"""Parcours sans aucun produit ni tarif injecté, sur un profil vierge."""
from playwright.sync_api import sync_playwright,expect
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page();external=[];errors=[]
    def protect(route):
        if route.request.url.startswith('http://127.0.0.1:43830/'):route.continue_()
        else:external.append(route.request.url);route.abort()
    page.route('**/*',protect);page.on('pageerror',lambda ex:errors.append(str(ex)))
    page.goto('http://127.0.0.1:43830');expect(page.locator('#sync-status')).to_have_text('Local · V3')
    assert page.evaluate('STATE.v3.public.products.length')==0
    assert page.evaluate('STATE.v3.privateProducts.length')==0
    page.locator('.nav-button[data-view="library"]').click();page.locator('#show-out').check()
    page.locator('#search-input').fill('quiche');page.locator('.recipe-card-main').first.click()
    expect(page.locator('.detail-columns')).to_be_visible();page.locator('[data-action="add-to-plan"]').click()
    page.evaluate('async()=>{await SYNC_QUEUE}')
    page.locator('.nav-button[data-view="courses"]').click()
    assert 'Prix inconnu' in page.locator('#stage').inner_text()
    page.locator('[data-action="v3-row"]').first.click()
    need=page.locator('#km3-row [name="quantity"]');q=float(need.input_value());need.fill(str(q+1))
    page.locator('#km3-row button[type="submit"]').click();page.evaluate('async()=>{await SYNC_QUEUE}')
    assert page.evaluate('Object.values(STATE.v3.rowOverrides).some(x=>x.purchaseQuantity)')
    assert not external and not errors,(external,errors)
    report={'status':'passed','syntheticPricesInjected':False,'publicPriceCount':0,'freshState':True,
        'unpricedRequirementEditable':True,'pageErrors':errors,'externalRequests':external,
        'transport':'HTTP loopback, same standalone HTML'}
    (ROOT/'reports/fresh-state-browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False));browser.close()
