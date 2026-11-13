import {Q,positive,text,requireThat} from './exact.mjs';

const FRACTIONS=new Map([['1/8','⅛'],['1/4','¼'],['3/8','⅜'],['1/3','⅓'],['1/2','½'],['2/3','⅔'],['5/8','⅝'],['3/4','¾'],['7/8','⅞']]);
function countText(q) {
  const whole=q.n/q.d,rest=q.sub(new Q(whole));
  if(!rest.n)return whole.toString();
  const fraction=FRACTIONS.get(rest.toString());
  return fraction?`${whole?`${whole} `:''}${fraction}`:q.toString();
}
function roundedDecimal(q,places) {
  const scale=10n**BigInt(places),scaled=q.mul(new Q(scale));
  const rounded=(scaled.n*2n+scaled.d)/(2n*scaled.d);
  if(!rounded&&q.n)return {amount:q.toString(),text:q.toString(),approximate:false};
  const value=new Q(rounded,scale),whole=rounded/scale;
  const decimal=(rounded%scale).toString().padStart(places,'0').replace(/0+$/,'');
  return {amount:value.toString(),text:decimal?`${whole},${decimal}`:whole.toString(),approximate:value.cmp(q)!==0};
}
/** Presentation only. Conversion evidence never changes the reference quantity. */
export function formatCulinaryQuantity(ingredient,amount,{pieceConversions,decimalPlaces=2,precise=false}={}) {
  const q=positive(amount,'culinary amount',true);
  requireThat(Number.isInteger(decimalPlaces)&&decimalPlaces>=0&&decimalPlaces<=6,'INVALID_DISPLAY_PRECISION','0..6');
  const referenceQuantity={amount:q.toString(),unit:ingredient.unit,basis:ingredient.basis,
    ...(ingredient.countKind?{countKind:ingredient.countKind}:{})};
  const natural=ingredient.culinary??{};
  let shown=q,unit=ingredient.unit,labels=natural,evidence=null,approximate=false;
  const configured=pieceConversions??(natural.pieceConversion?[{...natural.pieceConversion,ingredientId:ingredient.id}]:[]);
  const matches=configured.filter(c=>c.ingredientId===ingredient.id);
  requireThat(matches.length<=1,'AMBIGUOUS_CONVERSION',ingredient.id);
  if(matches.length&&!precise) {
    const c=matches[0];text(c.evidence,'culinary conversion evidence');
    requireThat(ingredient.unit==='g'&&c.basis===ingredient.basis,'INVALID_CONVERSION',ingredient.id);
    const raw=q.div(positive(c.gramsPerPiece,'gramsPerPiece'));
    // Only simple, close fractions; a small amount never becomes a whole vegetable.
    const candidates=['1/4','1/3','1/2','2/3','3/4','1','3/2','2','5/2','3','4','5','6','8','10'].map(Q.of);
    const best=candidates.sort((a,b)=>{
      const error=x=>x.cmp(raw)>=0?x.sub(raw):raw.sub(x);return error(a).cmp(error(b));
    })[0];
    const error=(best.cmp(raw)>=0?best.sub(raw):raw.sub(best)).div(raw.n?raw:1);
    const tolerance=positive(c.maxRelativeError??'1/10','maxRelativeError',true);
    requireThat(tolerance.cmp('1/4')<=0,'INVALID_CONVERSION','culinary tolerance exceeds 25%');
    if(q.n&&error.cmp(tolerance)<=0) {shown=best;unit='unit';labels=c;approximate=true;evidence=c.evidence;}
  }
  if(unit==='unit'&&natural.displayStep&&!precise) {
    const step=positive(natural.displayStep,'culinary displayStep');
    requireThat(step.cmp(1)<=0,'INVALID_DISPLAY_PRECISION','count display step must not exceed one');
    const ratio=shown.div(step),nearest=(ratio.n*2n+ratio.d)/(ratio.d*2n),rounded=step.mul(new Q(nearest));
    // Keep tiny requirements visible rather than turning them into zero.
    if(rounded.cmp(0)>0&&rounded.cmp(shown)!==0){shown=rounded;approximate=true;evidence=natural.displayEvidence??'Arrondi de présentation uniquement.';}
  }
  const display=unit==='unit'?{amount:shown.toString(),text:countText(shown),approximate:false}:
    precise?{amount:shown.toString(),text:shown.toString(),approximate:false}:roundedDecimal(shown,decimalPlaces);
  approximate ||= display.approximate;
  const label=shown.cmp(1)<=0?(labels.singular??ingredient.name??ingredient.id):(labels.plural??ingredient.name??ingredient.id);
  const measure=natural.measure==='pincée'&&shown.cmp(1)>0?'pincées':natural.measure;
  const phrase=unit==='unit'?(measure?`${display.text} ${measure} ${natural.joiner??'de '}${ingredient.name}`:`${display.text} ${label}`):
    `${display.text} ${unit} ${natural.joiner??'de '}${ingredient.name??ingredient.id}`;
  return {referenceQuantity,displayQuantity:{amount:display.amount,unit},text:`${approximate?'environ ':''}${phrase}`,
    approximate,evidence};
}

/** Rounds the aggregate shortfall, never each meal. No SKU or pack is inferred. */
export function ingredientPurchaseNeed(ingredient,quantity,displayOptions={}) {
  const required=Q.of(quantity.required),stock=Q.of(quantity.fromStock),shortfall=required.sub(stock);
  requireThat(shortfall.cmp(0)>=0,'INVALID_STOCK','stock exceeds need');
  const whole=ingredient.purchasePolicy?.wholeUnits===true;
  requireThat(!whole||ingredient.unit==='unit','INVALID_PURCHASE_POLICY',ingredient.id);
  const purchase=whole?new Q(shortfall.ceil()):shortfall;
  return {ingredientId:ingredient.id,label:ingredient.name??ingredient.id,referenceNeed:required.toString(),
    fromStock:stock.toString(),quantity:{amount:shortfall.toString(),unit:ingredient.unit,basis:ingredient.basis,
      ...(ingredient.countKind?{countKind:ingredient.countKind}:{})},
    culinaryNeed:formatCulinaryQuantity(ingredient,required,displayOptions),
    purchaseQuantity:{amount:purchase.toString(),unit:ingredient.unit,basis:ingredient.basis,
      ...(ingredient.countKind?{countKind:ingredient.countKind}:{})},
    purchaseDisplay:formatCulinaryQuantity(ingredient,purchase,displayOptions),
    minimumPurchaseSurplus:purchase.sub(shortfall).toString(),
    commercial:{determined:false,productId:null,packCount:null,priceCents:null,
      reason:'NO_VERIFIED_COMMERCIAL_CONTENT'}};
}
