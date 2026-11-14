import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
import {createWorker} from 'tesseract.js';
import {parseReceipt} from './receipts.mjs';
let assetsPromise;
const decode64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
async function assets() {
  if(!assetsPromise)assetsPromise=(async()=>{
    const node=document.getElementById('km3-assets');
    if(!node)throw Error('Les ressources OCR locales ne sont pas embarquées dans cette version.');
    if(!globalThis.DecompressionStream)throw Error('Ce navigateur ne prend pas en charge la lecture locale des ressources. Utilisez une version récente de Safari ou Chrome.');
    const bytes=decode64(node.textContent.trim());
    const text=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return JSON.parse(text);
  })();
  return assetsPromise;
}
export async function recognizeImage(image,{onProgress=()=>{}}={}) {
  const data=await assets(),urls=[];
  const blobURL=text=>{const url=URL.createObjectURL(new Blob([text],{type:'text/javascript'}));urls.push(url);return url;};
  const prefix=`const kmLanguage=${JSON.stringify(data.fraBase64)};const kmNativeFetch=self.fetch;self.fetch=(url,options)=>String(url).startsWith('km-ocr-local:/fra.traineddata')?Promise.resolve(new Response(Uint8Array.from(atob(kmLanguage),c=>c.charCodeAt(0)))):kmNativeFetch(url,options);\n`;
  const workerPath=blobURL(prefix+data.tesseractWorker),corePath=blobURL(data.tesseractCore)+'#core.js';
  let worker;
  try {
    worker=await createWorker('fra',1,{workerPath,workerBlobURL:false,corePath,langPath:'km-ocr-local:',gzip:false,cacheMethod:'none',
      logger:info=>onProgress(info.status,info.progress??0),errorHandler:()=>{}});
    const {data:result}=await worker.recognize(image);
    return {text:result.text,confidence:result.confidence};
  }finally{if(worker)await worker.terminate();urls.forEach(u=>URL.revokeObjectURL(u));}
}

export async function extractReceipt(file,{onProgress=()=>{}}={}) {
  if(!file||file.size>18000000)throw Error('Choisissez un ticket de moins de 18 Mo.');
  const ext=file.name.toLowerCase().split('.').at(-1);
  if(ext==='json') {
    const data=JSON.parse(await file.text());if(!Array.isArray(data.lines))throw Error('Le JSON doit contenir une liste « lines ».');
    return {...parseReceipt('',{fileName:file.name,format:'json'}),...data,status:'draft',fileName:file.name};
  }
  if(ext==='txt'||ext==='csv') {
    const text=await file.text();
    if(ext==='csv') {
      const rows=text.trim().split(/\r?\n/).map(s=>s.split(';'));
      if(normHeader(rows[0]).includes('prix')) {
        const draft=parseReceipt('',{fileName:file.name,format:'csv'});
        draft.lines=rows.slice(1).map(([name,quantity,price],i)=>({id:`csv-${i}`,name,quantity:quantity||'1',lineCents:Math.round(Number(String(price).replace(',','.'))*100),ignore:false,productId:'',discount:false}));
        return draft;
      }
    }
    return parseReceipt(text,{fileName:file.name,format:ext});
  }
  if(ext==='pdf'||file.type==='application/pdf') {
    const data=await assets(),workerUrl=URL.createObjectURL(new Blob([data.pdfWorker],{type:'text/javascript'}));
    pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
    let pdf;
    try {
      pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true,disableAutoFetch:true,disableStream:true}).promise;
      if(pdf.numPages>6)throw Error('Limite de six pages par ticket.');
      const texts=[];let usedOCR=false;const confidences=[];
      for(let n=1;n<=pdf.numPages;n++) {
        onProgress(`Lecture page ${n}/${pdf.numPages}`,n/pdf.numPages);
        const page=await pdf.getPage(n),content=await page.getTextContent(),lines=[];let previousY=null,line='';
        for(const item of content.items) {
          if(!('str' in item))continue;
          const y=Math.round(item.transform[5]);
          if(previousY!==null&&Math.abs(y-previousY)>3&&line){lines.push(line);line='';}
          line+=item.str+' ';previousY=y;
          if(item.hasEOL){lines.push(line);line='';previousY=null;}
        }
        if(line)lines.push(line);
        let text=lines.join('\n');
        if(text.replace(/\s/g,'').length<25) {
          usedOCR=true;
          const viewport=page.getViewport({scale:2}),canvas=document.createElement('canvas');
          if(viewport.width*viewport.height>12000000)throw Error('Page trop grande pour une lecture locale sûre sur mobile.');
          canvas.width=viewport.width;canvas.height=viewport.height;
          await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
          const result=await recognizeImage(canvas,{onProgress});text=result.text;confidences.push(result.confidence);
        }
        texts.push(text);page.cleanup();
      }
      return parseReceipt(texts.join('\n'),{fileName:file.name,format:usedOCR?'pdf_ocr':'pdf_text',confidence:confidences.length?Math.min(...confidences):null});
    }finally{if(pdf)await pdf.destroy();URL.revokeObjectURL(workerUrl);}
  }
  if(!['png','jpg','jpeg'].includes(ext)&&!['image/png','image/jpeg'].includes(file.type))throw Error('Formats acceptés : JPEG, PNG, PDF, JSON, CSV ou texte.');
  const url=URL.createObjectURL(file);
  try {const result=await recognizeImage(url,{onProgress});return parseReceipt(result.text,{fileName:file.name,format:'image_ocr',confidence:result.confidence});}
  finally{URL.revokeObjectURL(url);}
}
const normHeader=values=>values.join(' ').toLowerCase();
