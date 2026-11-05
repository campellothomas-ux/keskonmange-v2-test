// KeskonMange V2 — pilote de connexion Google (projet Firebase de TEST uniquement).
// GitHub Pages : popup déclenchée directement par un clic. Le redirect cross-origin est
// volontairement évité (voir la documentation Firebase sur le stockage tiers).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getDatabase, ref, onValue, runTransaction } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js';
import { assertStagingConfig, decodeSharedState, transactionTransform } from './firebase-sync.mjs';

export function makeFirebaseClient(config, callbacks = {}) {
  assertStagingConfig(config);
  const app = initializeApp({
    apiKey: config.apiKey, authDomain: config.authDomain, projectId: config.projectId,
    databaseURL: config.databaseURL, appId: config.appId
  }, 'keskonmange-v2-staging');
  const auth = getAuth(app), database = getDatabase(app);
  const shared = ref(database, 'v2/sharedState');
  let ready = false, member = false, connected = false;
  let unsubscribeState = null, unsubscribeConnection = null, unsubscribeAuth = null;
  let authGeneration = 0;

  function registerUser(user, version) {
    // L'UID est autorisé directement par les règles Firebase (aucune saisie dans Data).
    // La première lecture du nœud partagé est la preuve d'autorisation côté serveur.
    unsubscribeState = onValue(shared, (snapshot) => {
      if (version !== authGeneration) return;
      try {
        const fresh = decodeSharedState(snapshot.val());
        if (!member) callbacks.authorized?.(user.uid);
        member = true;
        ready = true;
        callbacks.state?.(fresh);
      } catch (err) {
        ready = false;
        callbacks.error?.(err);
      }
    }, (err) => {
      if (version !== authGeneration) return;
      member = false; ready = false;
      const code = String(err?.code || err?.message || '').toLowerCase();
      if (code.includes('permission_denied') || code.includes('permission denied')) {
        callbacks.forbidden?.(user.uid);
      } else callbacks.error?.(err);
    });
  }

  function start() {
    unsubscribeConnection = onValue(ref(database, '.info/connected'), (snapshot) => {
      connected = snapshot.val() === true;
      callbacks.connection?.(connected);
    });
    unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      const version = ++authGeneration;
      unsubscribeState?.(); unsubscribeState = null;
      ready = false; member = false;
      callbacks.auth?.(user);
      if (user) registerUser(user, version);
    }, (err) => callbacks.error?.(err));
  }

  return {
    start,
    get ready() { return ready && member; },
    // Appeler sans délai depuis le clic utilisateur pour éviter les bloqueurs de popup.
    signInGoogle() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return signInWithPopup(auth, provider);
    },
    signOut: () => signOut(auth),
    async mutate(operation) {
      if (!ready || !member || !auth.currentUser) throw new Error('Compte non autorisé ou données non chargées.');
      if (!connected) throw new Error('Hors connexion : modification refusée.');
      let capturedError;
      const result = await runTransaction(shared, (current) => {
        try { capturedError = undefined; return transactionTransform(current, operation); }
        catch (err) { capturedError = err; return undefined; }
      }, { applyLocally: false });
      if (!result.committed) throw capturedError || new Error('Opération annulée par Firebase.');
      return decodeSharedState(result.snapshot.val());
    },
    dispose() {
      ++authGeneration;
      unsubscribeState?.(); unsubscribeConnection?.(); unsubscribeAuth?.();
    }
  };
}
