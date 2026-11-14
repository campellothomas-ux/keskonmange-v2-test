// Exemples reproductibles EXCLUSIVEMENT synthétiques : jamais importés par l’app.
import {writeFile} from 'node:fs/promises';
import {fixtureState} from '../test/helpers.mjs';
import {command} from '../src/state.mjs';
import {generateMenu,calculateCart,productsOf} from '../src/economy.mjs';
import {selectReference,today} from '../src/prices.mjs';
import {parseReceipt} from '../src/receipts.mjs';
let s=fixtureState();
s=command(s,{type:'addManual',name:'Dépense supplémentaire SYNTHÉTIQUE',quantity:1,unit:'unité'});
s=command(s,{type:'editManual',id:s.shopping.manual[0].id,patch:{unitPriceCents:2000}});
const proposal=generateMenu(s,{meals:7,diners:2,maxMinutes:60});
const report={notice:'DONNÉES SYNTHÉTIQUES DE TEST, AUCUN PRIX COMMERCIAL VÉRIFIÉ',budgetCents:10000,
  menu:proposal.plan.map(m=>({recipe:s.recipes.find(r=>r.id===m.recipeId).nom,portions:m.portions})),
  evaluatedBaskets:proposal.search.evaluated,beforeExtra:{cents:proposal.cart.totalCents,manualCents:2000,coverage:proposal.cart.coverage},
  shopping:proposal.cart.rows.map(r=>({name:r.name,needed:r.necessary,bought:r.bought,packages:r.quantity,format:r.product?.quantityLabel,totalCents:r.totalCents}))};
s=command(s,{type:'acceptMenu',proposal});
s=command(s,{type:'addManual',name:'Dépassement SYNTHÉTIQUE',quantity:1,unit:'unité'});
const extra=Math.max(1500,10000-calculateCart(s).knownSubtotalCents+500);
s=command(s,{type:'editManual',id:s.shopping.manual.at(-1).id,patch:{unitPriceCents:extra}});
const over=calculateCart(s),newProposal=generateMenu(s,{meals:7,diners:2,maxMinutes:60});
report.afterExtra={addedCents:extra,cents:over.totalCents,remainingCents:over.remainingCents};
report.reoptimization={proposalCents:newProposal.cart.totalCents,previousPlanUnchanged:JSON.stringify(s.plan)===newProposal.basePlan,applied:false};
let personal=fixtureState();for(const o of personal.v3.observations)o.store='TEST MAGASIN';
const ids=['i_riz_basmati','i_lait','i_yaourt_grec_nature'],products=ids.map(id=>productsOf(personal).find(p=>personal.v3.bindings[p.id]?.ingredientId===id));
const before=products.map(p=>selectReference(p,personal.v3.observations,{store:'TEST MAGASIN'}));
const draft=parseReceipt(`TEST MAGASIN\n${today().split('-').reverse().join('/')}\nRIZ 1,80\nLAIT 1,20\nYAOURT 2,50\nBISCUITS 4,00\nREMISE -0,40\nTOTAL 9,10`);
products.forEach((p,k)=>draft.lines[k].productId=p.id);draft.lines[4].appliesTo=draft.lines[3].id;
personal=command(personal,{type:'confirmReceipt',draft});
report.receiptLearning=products.map((p,k)=>{const ref=selectReference(p,personal.v3.observations,{store:'TEST MAGASIN'});return {ingredientId:ids[k],beforeCents:before[k].cents,afterCents:ref.cents,source:ref.source,reason:ref.reason};});
await writeFile(new URL('../reports/synthetic-scenarios.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({notice:report.notice,menu:report.menu,evaluatedBaskets:report.evaluatedBaskets,beforeExtra:report.beforeExtra,afterExtra:report.afterExtra,reoptimization:report.reoptimization,receiptLearning:report.receiptLearning},null,2));
