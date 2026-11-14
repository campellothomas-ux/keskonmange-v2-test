import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifySources,localHTML} from '../../v2-lab/serve.mjs';
const HERE=new URL('../',import.meta.url),ROOT=new URL('../../../',import.meta.url);
await verifySources();
await mkdir(new URL('.cache/',HERE),{recursive:true});
const modelURL='https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/fra.traineddata';
const modelFile=new URL('.cache/fra.traineddata',HERE),modelHash='ced037562e8c80c13122dece28dd477d399af80911a28791a66a63ac1e3445ca';
try{await readFile(modelFile);}catch{execFileSync('curl',['-fsSL','--max-time','40',modelURL,'-o',fileURLToPath(modelFile)],{stdio:'inherit'});}
const model=await readFile(modelFile);
if(createHash('sha256').update(model).digest('hex')!==modelHash)throw Error('Modèle OCR différent de la référence attendue.');
const [worker,core,pdfWorker,source,css,icon,notices]=await Promise.all([
  readFile(new URL('node_modules/tesseract.js/dist/worker.min.js',HERE),'utf8'),
  readFile(new URL('node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',HERE),'utf8'),
  readFile(new URL('node_modules/pdfjs-dist/build/pdf.worker.mjs',HERE),'utf8'),
  readFile(new URL('index.html',ROOT),'utf8'),readFile(new URL('src/extension.css',HERE),'utf8'),readFile(new URL('apple-touch-icon.png',ROOT)),readFile(new URL('THIRD-PARTY-NOTICES.txt',HERE),'utf8'),
]);
const assets=gzipSync(JSON.stringify({tesseractWorker:worker,tesseractCore:core,pdfWorker,fraBase64:model.toString('base64')})).toString('base64');
const bundle=await build({entryPoints:[fileURLToPath(new URL('src/ui.mjs',HERE))],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',
  minify:true,charset:'utf8',legalComments:'eof',external:['node:*'],logLevel:'warning'});
let html=localHTML(source,bundle.outputFiles[0].text.replace(/<\/script/gi,'<\\/script'),'integrated-v3').html;
html=html.replace("const UI={view:'library'","const UI={view:'planning'");
html=html.replace("const navItems=[['library','book','Recettes'],['planning','list','Planning'],['courses','basket','Courses']];",
  "const navItems=[['planning','list','Planning'],['courses','basket','Courses'],['library','book','Recettes'],['profile','sliders','Profil']];");
html=html.replace('<title>KeskonMange — laboratoire local V2</title>','<title>KeskonMange V3 — Menus et budget</title>');
html=html.replace('<sup>V2</sup>','<sup>V3</sup>');
html=html.replace('</style>',css+'\n</style>');
html=html.replace('<link rel="apple-touch-icon" href="./apple-touch-icon.png">',`<link rel="icon" href="data:image/png;base64,${icon.toString('base64')}">`);
html=html.replace('<script type="application/json" id="km-lot0-fixture">',`<script type="application/json" id="km3-assets">${assets}</script><script type="application/json" id="km3-licenses">${JSON.stringify(notices).replace(/</g,'\\u003c')}</script><script type="application/json" id="km-lot0-fixture">`);
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];if(script.length!==1)throw Error('Document V3 inattendu.');
const hash=createHash('sha256').update(script[0][1]).digest('base64');
const csp=`default-src 'none'; script-src 'sha256-${hash}' blob: 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; connect-src https://world.openfoodfacts.org https://prices.openfoodfacts.org blob: data:; worker-src blob:; frame-src 'none'; object-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'`;
html=html.replace('<meta charset="UTF-8">',`<meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer">`);
if(/firebase-runtime\.mjs|firebase-config\.js|initializeApp\s*\(|serviceWorker\.register/.test(html))throw Error('Amorce Firebase interdite.');
await mkdir(new URL('dist/',HERE),{recursive:true});
await writeFile(new URL('dist/KeskonMange-V3.html',HERE),html);
await writeFile(new URL('dist/index.html',HERE),html);
await writeFile(new URL('dist/build.json',HERE),JSON.stringify({sha256:createHash('sha256').update(html).digest('hex'),bytes:Buffer.byteLength(html),ocrModel:{url:modelURL,sha256:modelHash},externalServices:['world.openfoodfacts.org','prices.openfoodfacts.org']},null,2));
console.log(`Application V3 autonome : ${Buffer.byteLength(html)} octets. OCR et PDF embarqués, aucun ticket transmis.`);
