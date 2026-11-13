// Fournisseur local compatible avec les callbacks V2. Aucun SDK, aucun réseau.
import { clone } from '../../core.mjs';
import { encodeSharedState, decodeSharedState } from '../../firebase-sync.mjs';

export const SCHEMA = 'keskonmange-v3-lot0/1';
export const storageKey = fixtureId => `keskonmange:v3:lot0:${fixtureId}:state`;

export async function assertLocalEnvironment(env) {
  if (env.location.protocol !== 'http:' || env.location.hostname !== '127.0.0.1'
      || !env.location.port || env.location.origin !== env.expectedOrigin) {
    throw Error('Ouvre le laboratoire depuis l’adresse locale affichée par son serveur dédié.');
  }
  if (env.hasFirebaseConfig) throw Error('Configuration Firebase détectée : démarrage local refusé.');
  const sw = env.serviceWorker;
  if (sw && (sw.controller || (await sw.getRegistrations()).length)) {
    throw Error('Un service worker existe déjà sur cette adresse. Relance le laboratoire sur un autre port dédié ; aucun cache existant ne sera supprimé.');
  }
  if (!env.locks?.request) {
    throw Error('Le verrouillage local est indisponible. Utilise un navigateur récent sur l’adresse 127.0.0.1 indiquée.');
  }
}

export function makeLocalClient({ fixtureId, seed, storage, locks, events, callbacks = {} }) {
  const key = storageKey(fixtureId);
  let ready = false;
  let listening = false;
  const envelope = (state, revision) => ({ schema: SCHEMA, fixtureId, revision, state });
  const read = () => {
    const raw = storage.getItem(key);
    if (raw === null) return envelope(decodeSharedState(encodeSharedState(clone(seed))), 0);
    let data;
    try { data = JSON.parse(raw); } catch { throw Error('Sauvegarde locale illisible : conservée, aucune écriture automatique. Réinitialise seulement les données de test si nécessaire.'); }
    if (data?.schema !== SCHEMA || data.fixtureId !== fixtureId
        || !Number.isSafeInteger(data.revision) || data.revision < 1) {
      throw Error('Version de sauvegarde locale incompatible : aucune écriture automatique.');
    }
    data.state = decodeSharedState(encodeSharedState(data.state));
    return data;
  };
  const notify = next => callbacks.state?.(clone(next.state));
  const write = (state, revision) => {
    const safe = decodeSharedState(encodeSharedState(state));
    const next = envelope(safe, revision);
    // Le callback n’est appelé qu’après une écriture réussie (quota, droits…).
    storage.setItem(key, JSON.stringify(next));
    notify(next);
    return next;
  };
  const locked = operation => locks.request(key, operation);
  const onStorage = event => {
    if (event.key !== key || !ready) return;
    try { notify(read()); } catch (error) { ready = false; callbacks.connection?.(false); callbacks.error?.(error); }
  };
  const listen = () => {
    if (!listening) { events?.addEventListener('storage', onStorage); listening = true; }
  };
  return {
    get ready() { return ready; },
    async start() {
      await locked(() => {
        const latest = read();
        if (latest.revision === 0) write(latest.state, 1); else notify(latest);
        ready = true;
        callbacks.connection?.(true);
      });
      listen();
    },
    async mutate(operation) {
      if (!ready) throw Error('Le stockage de test n’est pas prêt.');
      return locked(() => {
        const latest = read();
        return write(operation(clone(latest.state)), latest.revision + 1);
      });
    },
    async reset() {
      // Action explicite, disponible aussi si la sauvegarde de test est illisible.
      return locked(() => {
        write(clone(seed), 1);
        ready = true;
        callbacks.connection?.(true);
        listen();
      });
    },
    signInGoogle() { return Promise.reject(Error('Aucun compte ni accès Google dans ce laboratoire.')); },
    signOut() { return Promise.reject(Error('Mode local : aucun compte connecté.')); },
    dispose() { ready = false; events?.removeEventListener('storage', onStorage); listening = false; },
  };
}
