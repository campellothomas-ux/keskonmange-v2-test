export const session = {storeId:'test-store',asOf:'2026-11-12'};
export const quantity = (amount,unit='g',basis='net',extra={}) => ({amount,unit,basis,...extra});
export const ingredient = (id='tomato',extra={}) => ({id,unit:'g',basis:'net',allergens:[],...extra});
export const product = (id='can400',amount='400',cents=100,ingredientId='tomato',extra={}) => ({
  id,ingredientId,storeId:session.storeId,saleUnit:'package',mode:'fixed',content:quantity(amount),
  contentVerified:true,contentEvidence:'synthetic test content, no commercial assertion',
  price:{kind:'estimated',cents,currency:'EUR',storeId:session.storeId},...extra});
export const recipe = (id='sauce',amount='650',ingredientId='tomato',extra={}) => ({id,yieldPortions:4,scalable:true,
  family:id,ingredients:[{ingredientId,quantity:quantity(amount)}],...extra});
export const meal = (id='m1',recipeId='sauce',extra={}) => ({id,recipeId,diners:2,leftovers:'keep',...extra});
export const observed = cents => ({kind:'observed',cents,currency:'EUR',storeId:session.storeId,observedOn:session.asOf});
