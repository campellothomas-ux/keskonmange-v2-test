import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {validateFieldPacket} from '../src/index.mjs';
const base='ebbb9c9400fb4c0c99e7f5a24b7402ab05f43774';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',cwd:new URL('../../..',import.meta.url)});
const files=git('ls-tree','-r','--name-only',base).trim().split('\n');
const html=git('show',`${base}:index.html`),line=html.split('\n').find(l=>l.startsWith('const DEMO_IMPORT = '));
const demo=JSON.parse(line.slice('const DEMO_IMPORT = '.length).replace(/;$/,''));
const template=JSON.parse(await readFile(new URL('../fixtures/household-review.template.json',import.meta.url),'utf8'));
const report={assessedOn:template.session.asOf,source:{repository:'campellothomas-ux/keskonmange-v2-test',branch:'KeskonMange-V3',commit:base},
  scope:'Tracked repository data at lot 3 start; no Firebase, private household database, external catalog or receipt OCR access.',
  trackedFiles:files,receiptOrCommercialExportCandidates:files.filter(p=>/(?:ticket|receipt|facture|\.csv$|\.pdf$)/i.test(p)),
  found:{demoRecipes:demo.recettes.length,verifiedHouseholdRecipes:0,verifiedCommercialProducts:0,verifiedShopPrices:0,requiredHouseholdRecipes:5},
  candidates:demo.recettes.map((r,index)=>({source:`index.html:DEMO_IMPORT[${index}]`,name:r.nom,sourceKind:'demo',referencePortions:r.portions,
    units:[...new Set(r.ingredients.map(g=>g.unite))],householdValidated:false,
    missing:['household confirmation and source evidence','reviewed production mode/yield','canonical identities and weight bases',
      'necessary conversion evidence and indivisibility review','verified store-specific contents and price provenance']})),
  datasetClassification:[{path:'v3/engine/fixtures/v2-recipes.json',kind:'Git-traceable demo extraction, not household validation'},
    {path:'v3/engine/fixtures/scenario.json',kind:'synthetic commercial contents/prices and test annotations'},
    {path:'v3/engine/fixtures/lot2.json',kind:'synthetic recipes/products/prices'}],
  blockers:['Five reliable household recipes are not evidenced in the accessible repository.',
    'No accessible historical receipts or verified E.Leclerc Saint-Orens commercial catalog.',
    'No real field validation can be claimed from the existing fixtures.'],
  reviewTemplate:'fixtures/household-review.template.json',templateCheck:validateFieldPacket(template),fieldValidated:false};
console.log(JSON.stringify(report,null,2));
