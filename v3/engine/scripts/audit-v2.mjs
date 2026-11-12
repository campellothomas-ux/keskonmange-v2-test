import {readFile} from 'node:fs/promises';
import {adaptV2Recipes} from '../src/index.mjs';
const read = async name => JSON.parse(await readFile(new URL(`../fixtures/${name}`,import.meta.url),'utf8'));
const source = await read('v2-recipes.json'), annotations = await read('v2-test-annotations.json'), input = await read('scenario.json');
const result = adaptV2Recipes(source,annotations,input.ingredients);
console.log(JSON.stringify({source:source.source,notice:annotations.notice,sourceRecipeCount:source.recettes.length,
  ingredientUnits:source.recettes.flatMap(r => r.ingredients).reduce((o,g) => ({...o,[g.unite]:(o[g.unite] ?? 0)+1}),{}),...result},null,2));
