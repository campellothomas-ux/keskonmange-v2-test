import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {adaptV2Recipes} from '../src/index.mjs';
const read = async name => JSON.parse(await readFile(new URL(`../fixtures/${name}`,import.meta.url),'utf8'));
test('V2 fixture is traceable to Git; three annotated recipes adapt, eight require review', async () => {
  const source = await read('v2-recipes.json'), annotations = await read('v2-test-annotations.json'), scenario = await read('scenario.json');
  const original = structuredClone(source), result = adaptV2Recipes(source,annotations,scenario.ingredients);
  assert.equal(source.recettes.length,11); assert.equal(result.accepted.length,3); assert.equal(result.blocked.length,8);
  for (const r of result.accepted) {
    const actual = scenario.recipes.find(x => x.id === r.id);
    assert.deepEqual(r.ingredients,actual.ingredients); assert.equal(r.yieldPortions,actual.yieldPortions);
  }
  assert.deepEqual(source,original);
});
test('adapter never silently converts tablespoons, validates yield or certifies diet tags', async () => {
  const source = await read('v2-recipes.json'), scenario = await read('scenario.json');
  const result = adaptV2Recipes(source,{mappings:{},recipes:{}},scenario.ingredients);
  assert.equal(result.accepted.length,0); assert.equal(result.blocked.length,11);
  assert(result.blocked.every(r => r.code === 'RECIPE_REVIEW_REQUIRED'));
});
