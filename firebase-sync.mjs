// Coeur de synchronisation pur et testable : aucune dépendance réseau.
// Une chaîne JSON atomique empêche les tableaux vides de disparaître dans Realtime Database.
import { baseState, clone } from './core.mjs';

export const MAX_STATE_CHARS = 400_000;
export const FORBIDDEN_PROJECT_ID = 'keskonmange-42082';

export function assertStagingConfig(config) {
  if (!config || config.environment !== 'test') throw new Error('Configuration Firebase : environnement de test obligatoire.');
  for (const field of ['apiKey', 'authDomain', 'projectId', 'databaseURL', 'appId']) {
    if (typeof config[field] !== 'string' || !config[field].trim()) throw new Error(`Firebase : champ ${field} manquant.`);
  }
  if (config.projectId === FORBIDDEN_PROJECT_ID || config.databaseURL.includes(FORBIDDEN_PROJECT_ID)) {
    throw new Error('Sécurité : la base V1 de production est interdite pour ce pilote.');
  }
  const url = new URL(config.databaseURL);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.firebasedatabase.app')) {
    throw new Error('L’URL Realtime Database du projet de TEST est invalide.');
  }
  if (!/(?:test|staging|dev)/i.test(config.projectId)) {
    throw new Error('Le nom du projet de test doit contenir test, staging ou dev.');
  }
  return true;
}

export function validateSharedState(state) {
  if (!state || state.version !== 2 || !Array.isArray(state.recipes) || !Array.isArray(state.plan)
      || !Array.isArray(state.catalogCustom) || !state.shopping || !Array.isArray(state.shopping.manual)
      || typeof state.shopping.generated !== 'object' || typeof state.shopping.purchased !== 'object'
      || !state.rayonOverrides || typeof state.rayonOverrides !== 'object') {
    throw new Error('État des recettes/courses incomplet : écriture refusée.');
  }
  return state;
}

export function decodeSharedState(raw) {
  if (raw === null || raw === undefined) return baseState();
  if (typeof raw !== 'string') throw new Error('Format de la base de test inattendu.');
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error('État Firebase corrompu : écriture bloquée pour protéger les données.'); }
  return validateSharedState(data);
}

export function encodeSharedState(value) {
  const state = validateSharedState(value);
  const text = JSON.stringify(state);
  if (text.length > MAX_STATE_CHARS) throw new Error('Base de test trop volumineuse : export nécessaire avant de poursuivre.');
  return text;
}

// Appelé par le SDK à chaque nouvelle version concurrente.
// Il est crucial de recalculer *sur l'état transmis*, et jamais sur une copie locale obsolète.
export function transactionTransform(raw, operation) {
  const latest = decodeSharedState(raw);
  const result = operation(clone(latest));
  return encodeSharedState(result);
}
