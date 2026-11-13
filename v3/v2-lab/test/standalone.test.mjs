import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import { standaloneHTML, previewFragment } from '../build-standalone.mjs';

const source = await readFile(new URL('../../../index.html', import.meta.url), 'utf8');
const html = await standaloneHTML();

test('autonome : CSS, écrans et cœur V2 conservés', () => {
  assert.equal(html.match(/<style>([\s\S]*?)<\/style>/)[1], source.match(/<style>([\s\S]*?)<\/style>/)[1]);
  for (const [start, end] of [['const navItems=', 'const isFavorite='],
    ['function recipeDetails(', 'function importOpen('], ['function renderPlanning()', 'function renderCourses()']]) {
    assert.ok(html.includes(source.slice(source.indexOf(start), source.indexOf(end))));
  }
});

test('autonome : JavaScript classique valide, aucune dépendance de module ou Firebase', () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  new Script(scripts[0][1]);
  assert.doesNotMatch(html, /<script[^>]+src=|firebase-config\.js|firebase-runtime\.mjs|initializeApp\s*\(|serviceWorker\.register/);
  assert.doesNotMatch(scripts[0][1], /^\s*(?:import|export)\s|\bimport\s*\(/m);
  assert.match(html, /keskonmange:v3:lot0:autonome:/);
});

test('autonome : CSP embarquée ferme le réseau et correspond au script exact', () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const hash = createHash('sha256').update(script).digest('base64');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.ok(csp.includes(`script-src 'sha256-${hash}'`));
  assert.ok(!csp.includes("script-src 'self'"));
  for (const policy of ["default-src 'none'", "connect-src 'none'", "img-src data:", "worker-src 'none'", "form-action 'none'", "frame-src 'none'"]) assert.ok(csp.includes(policy));
  assert.equal((html.match(/<link /g) || []).length, 1);
  assert.match(html, /<link rel="icon" href="data:image\/png;base64,/);
});

test('aperçu : véritable application, fragment sans document imbriqué', () => {
  const preview = previewFragment(html);
  assert.ok(Buffer.byteLength(preview) < 1_000_000);
  assert.doesNotMatch(preview, /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i);
  assert.ok(preview.includes('id="km-v2-preview"'));
  assert.ok(preview.includes('function recipeDetails('));
});
