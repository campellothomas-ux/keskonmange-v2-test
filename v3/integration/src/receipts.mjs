import {cents,norm,today,validObservation} from './prices.mjs';

// Le texte reconnu est toujours un brouillon, jamais une preuve validée.
export function parseReceipt(text,{fileName='',format='text',confidence=null}={}) {
  if(typeof text!=='string'||text.length>150000)throw Error('Ticket vide ou trop volumineux.');
  const raw=text.replace(/\r/g,''),rows=raw.split('\n').map(s=>s.trim()).filter(Boolean),lines=[],notes=[];
  let date='',store='',totalCents=null,pendingQuantity=null;
  for(let index=0;index<rows.length;index++) {
    const line=rows[index],label=norm(line);
    const d=line.match(/\b(\d{2})[/.\-](\d{2})[/.\-](20\d{2}|\d{2})\b/);
    if(d&&!date){const year=d[3].length===2?'20'+d[3]:d[3];const candidate=`${year}-${d[2]}-${d[1]}`;if(!Number.isNaN(Date.parse(candidate))&&new Date(candidate).toISOString().slice(0,10)===candidate)date=candidate;}
    if(!store&&/\b(leclerc|lidl|carrefour|auchan|intermarche|super u|monoprix|test magasin)\b/.test(label))store=line;
    const tail=line.match(/(-?\d{1,6}[.,]\d{2})\s*(?:EUR|€)?\s*[A-Z]?\s*$/i);
    if(!tail)continue;
    let amount;try {amount=cents(tail[1]);}catch{continue;}
    if(/\b(total|a payer|net a payer)\b/.test(label)&&!/(sous total|total remise|total reduction|total tva)/.test(label)){totalCents=amount;continue;}
    if(/\b(carte|especes|rendu|tva|ht|cb|monnaie|sous total)\b/.test(label))continue;
    let name=line.slice(0,tail.index).trim().replace(/[.·]{2,}/g,'').trim();
    if(!name)continue;
    if(/\b(remise|reduction|promotion|avantage)\b/.test(label)||amount<0) {
      lines.push({id:`draft-${index}`,name,quantity:'1',lineCents:-Math.abs(amount),discount:true,ignore:false,productId:'',ingredientId:'',contentAmount:'',contentUnit:'',raw:line});
      continue;
    }
    const weight=name.match(/(\d+(?:[.,]\d+)?)\s*(kg|g)\s*(?:x|a|à|@)\s*(\d+[.,]\d{2})/i);
    const count=name.match(/^(\d+(?:[.,]\d+)?)\s*[xX*]\s*/);
    const quantity=weight?String(Number(weight[1].replace(',','.'))*(weight[2].toLowerCase()==='g'?0.001:1)):count?count[1].replace(',','.'):'1';
    if(count)name=name.slice(count[0].length).trim();
    lines.push({id:`draft-${index}`,name,quantity,lineCents:amount,discount:false,ignore:false,productId:'',ingredientId:'',contentAmount:weight?'1000':'',contentUnit:weight?'g':'',saleMode:weight?'weight':'fixed',raw:line});
  }
  if(!date)notes.push('Date non reconnue : à renseigner.');
  if(!store)notes.push('Magasin non reconnu : à renseigner.');
  if(totalCents===null)notes.push('Total non reconnu : à renseigner.');
  if(!lines.length)notes.push('Aucune ligne fiable extraite. Vous pouvez coller ou corriger le texte.');
  return {fileName,format,confidence,rawText:raw,store,date,totalCents,lines,notes,status:'draft'};
}

export function validateReceipt(draft,{id,products=[],confirmed=false}={}) {
  if(!confirmed)throw Error('La confirmation humaine du ticket est obligatoire.');
  if(!id||!draft.store?.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)||Number.isNaN(Date.parse(draft.date))||new Date(draft.date).toISOString().slice(0,10)!==draft.date||draft.date>today())throw Error('Magasin et date valides obligatoires.');
  if(!Array.isArray(draft.lines)||draft.lines.length>400)throw Error('Lignes du ticket invalides.');
  let sum=0;const observations=[],lines=[];
  const activeLineIds=new Set(draft.lines.filter(l=>!l.ignore&&!l.discount).map(l=>l.id));
  const unassignedDiscount=draft.lines.some(l=>l.discount&&!l.ignore&&!activeLineIds.has(l.appliesTo));
  for(const raw of draft.lines) {
    if(raw.ignore)continue;
    const line=structuredClone(raw),quantity=Number(String(line.quantity).replace(',','.'));
    if(!line.name?.trim()||!Number.isFinite(quantity)||quantity<=0||!Number.isSafeInteger(line.lineCents))throw Error('Chaque ligne doit avoir un nom, une quantité positive et un prix valide.');
    if(!line.discount&&line.lineCents<0)throw Error('Un prix négatif doit être identifié comme remise.');
    sum+=line.lineCents;lines.push(line);
    if(line.discount||!line.productId||draft.skipObservations)continue;
    if(unassignedDiscount)throw Error('Affectez chaque remise à un article, ou enregistrez le ticket sans références tarifaires. Aucune répartition arbitraire ne sera inventée.');
    const product=products.find(p=>p.id===line.productId);if(!product)throw Error('Produit de référence introuvable.');
    if((line.saleMode==='weight')!==(product.saleMode==='weight'))throw Error('La quantité en kilogrammes et le mode de vente du produit ne correspondent pas. Vérifiez le poids ou le conditionnement.');
    const relatedDiscounts=draft.lines.filter(d=>!d.ignore&&d.discount&&d.appliesTo===line.id);
    const reduction=relatedDiscounts.reduce((a,d)=>a+d.lineCents,0),net=line.lineCents+reduction;
    if(net<0)throw Error('La remise dépasse le montant de la ligne.');
    observations.push(validObservation({id:`${id}:${line.id}`,productId:product.id,cents:Math.round(net/quantity),currency:'EUR',date:draft.date,store:draft.store.trim(),
      source:'receipt',evidence:`Ticket personnel ${id} · ligne ${line.id}`,receiptId:id,lineId:line.id,promotion:relatedDiscounts.length>0,
      quantity,paidLineCents:net,content:structuredClone(product.content),contentEvidence:product.quantityLabel||product.content?.evidence||'Conditionnement confirmé par le foyer'}));
  }
  if(!Number.isSafeInteger(draft.totalCents)||draft.totalCents<0)throw Error('Total du ticket à renseigner.');
  const difference=draft.totalCents-sum;
  if(Math.abs(difference)>2&&!draft.acceptDifference)throw Error(`Le total diffère de ${(difference/100).toFixed(2)} €. Corrigez les lignes ou confirmez explicitement l’écart.`);
  return {receipt:{id,store:draft.store.trim(),date:draft.date,totalCents:draft.totalCents,lines,differenceCents:difference,confirmedOn:today(),fileName:draft.fileName,
    rawText:draft.keepRawText?draft.rawText:undefined,private:true,format:draft.format},observations};
}
export function deleteReceipt(history,id) {
  return {...history,receipts:history.receipts.filter(r=>r.id!==id),observations:history.observations.filter(o=>o.receiptId!==id)};
}
