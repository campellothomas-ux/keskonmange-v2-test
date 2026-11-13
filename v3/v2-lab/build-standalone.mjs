// Outil de préparation, jamais nécessaire à la personne qui reçoit le HTML.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { localHTML, verifySources } from './serve.mjs';

const HERE = new URL('./', import.meta.url);
const ROOT = new URL('../../', import.meta.url);
export async function standaloneHTML() {
  await verifySources();
  const [source, bootstrap, runtime, contract, icon] = await Promise.all([
    readFile(new URL('index.html', ROOT), 'utf8'),
    readFile(new URL('standalone-bootstrap.js', HERE), 'utf8'),
    readFile(new URL('local-runtime.mjs', HERE), 'utf8'),
    readFile(new URL('firebase-sync.mjs', ROOT), 'utf8'),
    readFile(new URL('apple-touch-icon.png', ROOT)),
  ]);
  // Réutiliser les validateurs existants et le client du lot 0 sans imports.
  const start = contract.indexOf('export function validateSharedState(');
  const end = contract.indexOf('// Appelé par le SDK', start);
  if (start < 0 || end < 0) throw Error('Contrat V2 inattendu.');
  const validators = 'const MAX_STATE_CHARS = 400_000;\n'
    + contract.slice(start, end).replaceAll('export ', '');
  const clientStart = runtime.indexOf('export function makeLocalClient(');
  if (clientStart < 0) throw Error('Client du lot 0 inattendu.');
  const client = "const SCHEMA = 'keskonmange-v3-lot0-autonome/1';\n"
    + 'const storageKey = id => `keskonmange:v3:lot0:autonome:${id}:${encodeURIComponent(location.pathname)}:state`;\n'
    + validators + '\n' + runtime.slice(clientStart).replace('export function ', 'function ');
  let html = localHTML(source, bootstrap.replace('/*__LOCAL_CLIENT__*/', client), 'autonome').html;
  html = html.replace('<title>KeskonMange — laboratoire local V2</title>', '<title>KeskonMange — Démonstration V2</title>');
  html = html.replace('<link rel="apple-touch-icon" href="./apple-touch-icon.png">',
    `<link rel="icon" href="data:image/png;base64,${icon.toString('base64')}">`);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (scripts.length !== 1) throw Error('Script autonome inattendu.');
  const hash = createHash('sha256').update(scripts[0][1]).digest('base64');
  const csp = `default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; worker-src 'none'; manifest-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  html = html.replace('<meta charset="UTF-8">', `<meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer">`);
  if (/^\s*(?:import|export)\s|\bimport\s*\(/m.test(scripts[0][1])
      || /<script[^>]+src=|firebase-config\.js|firebase-runtime\.mjs|initializeApp\s*\(|serviceWorker\.register/.test(html)) {
    throw Error('Une dépendance interdite subsiste dans le fichier autonome.');
  }
  return html;
}

export function previewFragment(html) {
  const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[0];
  const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1];
  if (!style || !body) throw Error('Document autonome incomplet.');
  return '<div id="km-v2-preview" aria-label="KeskonMange V2 — démonstration interactive">\n'
    + style + '\n<style>#km-v2-preview{height:780px;overflow:auto;position:relative}#km-v2-preview:has(.modal-backdrop){overflow:hidden}</style>\n'
    + body + '\n</div>\n'
    // Le sandbox de l’aperçu interdit les soumissions HTML natives. Déclencher
    // seulement les gestionnaires locaux V2, sans requête ni soumission réelle.
    + `<script>(() => {
      const root = document.getElementById('km-v2-preview');
      root.dataset.preview = 'v2';
      // Isoler aussi la cascade typographique de l’hôte, en réutilisant le CSS
      // V2 exact. Aucun composant ou style produit n’est redessiné.
      const originalStyle = root.querySelector('style');
      for (const rule of originalStyle.sheet.cssRules) {
        if (rule.selectorText === ':root' && rule.style.fontFamily) root.style.fontFamily = rule.style.fontFamily;
      }
      root.style.fontSize = 'medium'; root.style.lineHeight = 'normal'; root.style.colorScheme = 'light';
      const isolatedStyle = document.createElement('style');
      isolatedStyle.textContent = '#km-v2-preview {p{font-family:inherit}' + originalStyle.textContent + '}';
      root.append(isolatedStyle);
      const localSubmit = form => {
        if (form.reportValidity()) form.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}));
      };
      root.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (button?.dataset.action === 'nav') queueMicrotask(() => root.scrollTo(0, 0));
        if (!button || button.type !== 'submit' || !button.form) return;
        event.preventDefault(); localSubmit(button.form);
      }, true);
      root.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || event.isComposing || !event.target.matches('input') || !event.target.form) return;
        event.preventDefault(); localSubmit(event.target.form);
      }, true);
    })();</script>\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = resolve(process.argv[2] || 'v3/v2-lab/dist/KeskonMange-Demo-V2.html');
  await mkdir(resolve(target, '..'), { recursive: true });
  await writeFile(target, await standaloneHTML(), 'utf8');
  console.log(target);
}
