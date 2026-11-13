// Inclus à la place du seul démarrage Firebase ; rendu et événements V2 conservés.
gate('KeskonMange — test local', 'Chargement des exemples indépendants…');
const nativeStatus = setStatus;
setStatus = text => nativeStatus(/^(Synchronisé|Connecté)$/.test(text) ? 'Test local'
  : /^Synchronisation/.test(text) ? 'Enregistrement local…' : text);
const accountButton = document.querySelector('[data-action="sign-out"]');
accountButton.disabled = true;
accountButton.title = 'Mode local : aucun compte connecté';
accountButton.setAttribute('aria-label', 'Mode local : aucun compte connecté');
const localTools = document.createElement('div');
localTools.className = 'notice';
localTools.innerHTML = '<strong>Laboratoire V3 · interface V2</strong> — Données de test uniquement, enregistrées dans ce navigateur. Aucun accès Firebase. <button type="button" class="button small ghost" id="lot0-reset">Réinitialiser le test</button>';
document.querySelector('.app').insertBefore(localTools, document.querySelector('.stage'));
const resetButton = document.getElementById('lot0-reset');
resetButton.disabled = true;
resetButton.addEventListener('click', () => {
  if (!SYNC) return;
  // Permet aussi la récupération explicite d’une sauvegarde de test invalide.
  unGate(); UI.modal = 'lot0-reset';
  openModal(head('Réinitialiser les données de test ?', 'LABORATOIRE LOCAL')
    + '<p>Seules les modifications de ce laboratoire seront remplacées par les exemples initiaux. Aucune autre sauvegarde ne sera effacée.</p>'
    + '<div class="modal-footer"><button class="button ghost" data-action="close-modal">Annuler</button><button class="button danger" id="lot0-confirm-reset">Réinitialiser le test</button></div>');
  document.getElementById('lot0-confirm-reset').addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try { await SYNC_QUEUE.catch(() => {}); await SYNC.reset(); closeModal(); renderView(); showToast('Exemples de test restaurés'); }
    catch (err) { closeModal(); gate('Stockage local indisponible', err.message); setStatus('Erreur locale'); }
  });
});
async function bootLocal() {
  try {
    const { assertLocalEnvironment, makeLocalClient } = await import('./v3/v2-lab/local-runtime.mjs');
    const { expectedOrigin, fixtureId, state: seed } = JSON.parse(document.getElementById('km-lot0-fixture').textContent);
    await assertLocalEnvironment({ location, expectedOrigin, hasFirebaseConfig: 'KM_STAGING_CONFIG' in window,
      serviceWorker: navigator.serviceWorker, locks: navigator.locks });
    SYNC = makeLocalClient({ fixtureId, seed, storage: localStorage, locks: navigator.locks, events: window,
      callbacks: {
        state(next) { STATE = next; renderView(); unGate(); setStatus(BUSY ? 'Enregistrement local…' : 'Test local'); },
        connection(ready) { SYNC_CONNECTED = ready; setStatus(ready ? 'Test local' : 'Erreur locale'); },
        error(err) { gate('Sauvegarde locale à vérifier', err.message); setStatus('Erreur locale'); },
      },
    });
    await SYNC.start();
  } catch (err) {
    gate('Démarrage local interrompu', err.message || String(err));
    if (SYNC) {
      const recovery = document.createElement('button');
      recovery.className = 'button ghost'; recovery.textContent = 'Réinitialiser uniquement le test';
      recovery.addEventListener('click', () => resetButton.click());
      document.querySelector('.gate-card').append(recovery);
    }
    setStatus('Erreur locale');
  } finally { resetButton.disabled = !SYNC; }
}
bootLocal();
