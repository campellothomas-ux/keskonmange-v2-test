// Diagnostic réel, sans réponse simulée, sans écriture dans le référentiel.
// Les refus du proxy sont des échecs de transport, jamais des réponses des API.
import {execFile} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const folder=await mkdtemp(join(tmpdir(),'km3-public-probe-'));
const targets=[
  ['Open Food Facts','https://world.openfoodfacts.org/api/v2/product/3017620422003.json?fields=code,product_name,quantity'],
  ['Open Prices','https://prices.openfoodfacts.org/api/v1/prices/?product_code=3017620422003&currency=EUR&page_size=5&order_by=-date'],
  ['Documentation OFF','https://openfoodfacts.github.io/openfoodfacts-server/api/'],
];
const results=await Promise.all(targets.map(async([service,url],index)=>{
  const output=join(folder,`${index}.response`),start=Date.now();
  const call=await new Promise(resolve=>execFile('curl',['--silent','--show-error','--location','--max-redirs','2','--max-time','15','--user-agent','KeskonMange/3 isolated-readonly-probe','--output',output,'--write-out','%{http_code}',url],{timeout:18000},(error,stdout,stderr)=>resolve({exitCode:error?.code??0,stdout,stderr})));
  const result={service,url,domain:new URL(url).hostname,exitCode:call.exitCode,httpStatus:call.stdout.trim(),error:call.stderr.trim(),durationMs:Date.now()-start,apiResponseReceived:false};
  if(call.exitCode===0&&/^2\d\d$/.test(result.httpStatus)){
    const body=await readFile(output,'utf8');
    if(service==='Documentation OFF')result.documentReceived=body.length>0;
    else try{
      const data=JSON.parse(body);result.apiResponseReceived=true;
      result.productFound=data.status===1&&!!data.product;
      result.observationsReceived=Array.isArray(data.items)?data.items.length:0;
      result.responseSnapshot=JSON.parse(body);
    }catch{result.error='Réponse non JSON : API non vérifiée.';}
  }
  return result;
}));
await rm(folder,{recursive:true,force:true});
const report={checkedAt:new Date().toISOString(),mode:'LIVE_HTTP_NOT_MOCKED',results,
  realPriceIntegrationVerified:results[0].apiResponseReceived&&results[1].apiResponseReceived,
  priceCoverage:results[1].apiResponseReceived?'Mesure pilote nécessaire, ce diagnostic ne mesure pas la bibliothèque.':'Non mesurable : API inaccessible depuis cette instance.',
  publicSeedModified:false,privateDataSent:false};
await mkdir(new URL('../reports/',import.meta.url),{recursive:true});
await writeFile(new URL('../reports/live-sources.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
