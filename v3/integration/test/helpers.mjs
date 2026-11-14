// Toutes les valeurs de ce fichier sont synthétiques, exclusivement pour tests.
import {createState} from '../src/state.mjs';
import {ingredients} from '../src/catalog.mjs';
import {today} from '../src/prices.mjs';
export function fixtureState() {
  const s=createState();s.v3.testMode=true;s.v3.profile.store='TEST MAGASIN';
  for(const [k,i] of ingredients.entries()) {
    const id=`test-product-${k}`,amount=i.unit==='unit'?'12':'500';
    s.v3.privateProducts.push({id,name:`${i.name} — DONNÉES SYNTHÉTIQUES`,quantityLabel:`FORMAT FICTIF ${amount} ${i.unit}`,content:{amount,unit:i.unit},source:'test',synthetic:true});
    s.v3.bindings[id]={ingredientId:i.id,amount,confirmed:true,evidence:'SCÉNARIO SYNTHÉTIQUE, AUCUNE RÉFÉRENCE COMMERCIALE RÉELLE'};
    s.v3.observations.push({id:`test-observation-${k}`,productId:id,cents:65+(k*17)%130,currency:'EUR',date:today(),store:'AUTRE MAGASIN DE TEST',source:'manual',evidence:'PRIX FICTIF DE TEST',promotion:false});
  }
  return s;
}
export function legacyMeal(s,{id='test-recipe',ingredientId='i_oignon',amount=0.5,unit='pièce',portions=1}={}) {
  s.recipes.push({id,nom:id,portions,tempsMinutes:10,ingredients:[{ingredientId,nom:id,quantite:amount,unite:unit,meta:{rayon:'fruits_legumes'}}],etapes:['Étape de test.'],tags:[],effort:{},saisonnalite:{}});
  s.plan.push({id:'meal-'+id,recipeId:id,portions});return s;
}
