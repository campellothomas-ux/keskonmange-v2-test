// Même contrat V2, emballage autonome : aucun import ni accès réseau.
(() => {
  /*__LOCAL_CLIENT__*/
  gate('KeskonMange — démonstration', 'Chargement des données de test…');
  const { fixtureId, state: seed } = JSON.parse(document.getElementById('km-lot0-fixture').textContent);
  const nativeStatus = setStatus;
  let persistent = true;
  const key = storageKey(fixtureId);
  const mirror = new Map();
  let backing;
  const account = document.querySelector('[data-action="sign-out"]');
  account.disabled = true;
  account.title = 'Démonstration sans compte ni connexion';
  account.setAttribute('aria-label', account.title);
  const notice = document.createElement('div');
  notice.className = 'notice';
  notice.innerHTML = '<strong>Démonstration V2 · données de test</strong> — Aucun accès à vos données. <span id="km-demo-storage" role="status"></span> <button type="button" class="button small ghost" id="lot0-reset">Réinitialiser le test</button>';
  document.querySelector('.app').insertBefore(notice, document.querySelector('.stage'));
  const storageHint = document.getElementById('km-demo-storage');
  const hint = () => {
    storageHint.textContent = persistent
      ? 'Sauvegarde dans ce navigateur. Gardez le même fichier et une seule fenêtre ouverte.'
      : 'Sauvegarde indisponible : vos essais restent dans cette fenêtre jusqu’à sa fermeture.';
    storageHint.classList.toggle('auth-error', !persistent);
  };
  const volatile = () => { persistent = false; hint(); };
  try { backing = localStorage; } catch { volatile(); }
  const storage = {
    getItem(name) {
      if (name !== key) throw Error('Accès à une autre sauvegarde refusé.');
      if (persistent) {
        try {
          const raw = backing.getItem(name);
          if (raw === null) mirror.delete(name); else mirror.set(name, raw);
          return raw;
        } catch { volatile(); }
      }
      return mirror.get(name) ?? null;
    },
    setItem(name, value) {
      if (name !== key) throw Error('Accès à une autre sauvegarde refusé.');
      if (persistent) {
        try { backing.setItem(name, value); } catch { volatile(); }
      }
      mirror.set(name, value);
      hint();
    },
  };
  let queue = Promise.resolve();
  const locks = { request(name, operation) {
    // Une fenêtre suffit pour la démo ; aucune dépendance à Web Locks en file://.
    const next = queue.catch(() => {}).then(operation);
    queue = next;
    return next;
  } };
  setStatus = text => nativeStatus(/^(Synchronisé|Connecté|Synchronisation.*)$/.test(text)
    ? (persistent ? 'Test local' : 'Session de test') : text);
  const reset = document.getElementById('lot0-reset');
  reset.disabled = true;
  reset.addEventListener('click', () => {
    if (!SYNC) return;
    unGate(); UI.modal = 'lot0-reset';
    openModal(head('Réinitialiser les données de test ?', 'DÉMONSTRATION')
      + '<p>Seuls les essais réalisés dans ce fichier seront remplacés par les exemples initiaux.</p>'
      + '<div class="modal-footer"><button class="button ghost" data-action="close-modal">Annuler</button><button class="button danger" id="lot0-confirm-reset">Réinitialiser le test</button></div>');
    document.getElementById('lot0-confirm-reset').addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      try { await SYNC_QUEUE.catch(() => {}); await SYNC.reset(); closeModal(); renderView(); showToast('Exemples de test restaurés'); }
      catch (err) { closeModal(); gate('Réinitialisation impossible', err.message); }
    });
  });
  async function bootStandalone() {
    try {
      if ('KM_STAGING_CONFIG' in window) throw Error('Configuration externe détectée : démonstration interrompue.');
      SYNC = makeLocalClient({ fixtureId, seed, storage, locks, events: window,
        callbacks: {
          state(next) { STATE = next; renderView(); unGate(); hint(); setStatus(persistent ? 'Test local' : 'Session de test'); },
          connection(ready) { SYNC_CONNECTED = ready; setStatus(ready ? (persistent ? 'Test local' : 'Session de test') : 'Erreur locale'); },
          error(err) { gate('Sauvegarde de test à vérifier', err.message); setStatus('Erreur locale'); },
        },
      });
      await SYNC.start();
    } catch (err) {
      gate('Démonstration interrompue', err.message || String(err));
      if (SYNC) {
        const recovery = document.createElement('button');
        recovery.className = 'button ghost'; recovery.textContent = 'Réinitialiser uniquement le test';
        recovery.addEventListener('click', () => reset.click());
        document.querySelector('.gate-card').append(recovery);
      }
      setStatus('Erreur locale');
    } finally { reset.disabled = !SYNC; }
  }
  bootStandalone();
})();
