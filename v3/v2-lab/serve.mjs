import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { makeFixture } from './fixture.mjs';

const HERE = new URL('./', import.meta.url);
const ROOT = new URL('../../', import.meta.url);
export const sha256 = data => createHash('sha256').update(data).digest('hex');

export async function verifySources(root = ROOT) {
  const lock = JSON.parse(await readFile(new URL('source-lock.json', HERE), 'utf8'));
  for (const [path, digest] of Object.entries(lock.files)) {
    if (sha256(await readFile(new URL(path, root))) !== digest) {
      throw Error(`La référence V2 a changé (${path}). Revoir explicitement le socle et les tests avant de démarrer.`);
    }
  }
  return lock;
}

function replaceOnce(text, before, after) {
  if (text.split(before).length !== 2) throw Error('Point d’adaptation V2 absent ou ambigu. Démarrage refusé.');
  return text.replace(before, after);
}

export function localHTML(source, bootstrap, expectedOrigin) {
  let html = replaceOnce(source, '<script src="./firebase-config.js"></script>', '');
  html = replaceOnce(html, '<link rel="manifest" href="./manifest.webmanifest">', '');
  html = replaceOnce(html, '<title>KeskonMange V2 — Vos recettes</title>', '<title>KeskonMange — laboratoire local V2</title>');
  const start = html.indexOf("gate('KeskonMange — espace test'");
  const end = html.indexOf('// Mode iPhone', start);
  if (start < 0 || end < 0 || html.indexOf('bootStaging();', start) < 0) throw Error('Démarrage V2 inattendu.');
  html = html.slice(0, start) + bootstrap + '\n' + html.slice(end);
  html = replaceOnce(html, "if('serviceWorker'in navigator&&location.protocol==='https:'){navigator.serviceWorker.register('./service-worker.js').catch(()=>{});}", '// Service worker volontairement absent du laboratoire.');
  // Uniquement des libellés d’enregistrement, aucune fonction métier ou règle UX.
  for (const [before, after] of [
    ['Les modifications sont enregistrées sur Firebase.', 'Les modifications sont enregistrées localement pour ce test.'],
    ['La liste est partagée et synchronisée avec Firebase.', 'La liste de test est enregistrée dans ce navigateur.'],
    ['Cette action sera enregistrée dans Firebase pour le foyer.', 'Cette action sera enregistrée uniquement dans ce laboratoire local.'],
    ["'erreur Firebase'", "'erreur locale'"],
    ['Échec de synchronisation', 'Échec de l’enregistrement local'],
    ['Connecte-toi au Firebase de test avant toute modification.', 'Le stockage local doit être prêt avant toute modification.'],
  ]) html = replaceOnce(html, before, after);
  const fixture = JSON.stringify({ ...makeFixture(source), expectedOrigin }).replaceAll('<', '\\u003c');
  html = replaceOnce(html, '<script>// KeskonMange V2', `<script type="application/json" id="km-lot0-fixture">${fixture}</script><script>// KeskonMange V2`);
  if (/firebase-config\.js|firebase-runtime\.mjs|initializeApp\s*\(|serviceWorker\.register|https:\/\/www\.gstatic\.com/.test(html)) {
    throw Error('Amorce réseau interdite dans le document local.');
  }
  const executable = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (executable.length !== 1) throw Error('Scripts V2 inattendus.');
  const hash = createHash('sha256').update(executable[0][1]).digest('base64');
  const csp = `default-src 'none'; script-src 'self' 'sha256-${hash}'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; worker-src 'none'; manifest-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
  return { html, csp };
}

export async function createLabServer({ port = 43820 } = {}) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Port local dédié attendu (1024–65535).');
  await verifySources();
  const expectedOrigin = `http://127.0.0.1:${port}`;
  const [source, bootstrap, runtime, core, contract, icon] = await Promise.all([
    readFile(new URL('index.html', ROOT), 'utf8'), readFile(new URL('bootstrap.js', HERE), 'utf8'),
    readFile(new URL('local-runtime.mjs', HERE)), readFile(new URL('core.mjs', ROOT)),
    readFile(new URL('firebase-sync.mjs', ROOT)), readFile(new URL('apple-touch-icon.png', ROOT)),
  ]);
  const { html, csp } = localHTML(source, bootstrap, expectedOrigin);
  const routes = new Map([
    ['/', ['text/html; charset=utf-8', html]], ['/index.html', ['text/html; charset=utf-8', html]],
    ['/v3/v2-lab/local-runtime.mjs', ['text/javascript; charset=utf-8', runtime]],
    ['/core.mjs', ['text/javascript; charset=utf-8', core]],
    // Module pur existant, sans SDK et sans initialisation Firebase.
    ['/firebase-sync.mjs', ['text/javascript; charset=utf-8', contract]],
    ['/apple-touch-icon.png', ['image/png', icon]], ['/favicon.ico', ['image/png', icon]],
  ]);
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== expectedOrigin)) {
      res.writeHead(403); res.end('Adresse locale dédiée requise.'); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    // Aucun proxy, aucune redirection, aucun répertoire statique général.
    const entry = routes.get(req.url);
    if (!entry) { res.writeHead(404); res.end('Ressource absente du laboratoire local.'); return; }
    res.setHeader('Content-Type', entry[0]);
    res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : entry[1]);
  });
  return { server, expectedOrigin };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const port = Number(process.argv[2] || 43820);
    const { server, expectedOrigin } = await createLabServer({ port });
    server.on('error', err => { console.error(`Laboratoire non démarré : ${err.code === 'EADDRINUSE' ? 'port déjà utilisé ; choisir un autre port dédié' : err.message}`); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => console.log(`KeskonMange — LOT 0 : ${expectedOrigin}\nInterface V2, données de test locales, aucun Firebase. Ctrl+C pour arrêter.`));
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
