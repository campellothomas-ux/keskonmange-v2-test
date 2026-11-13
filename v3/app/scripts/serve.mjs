import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const html=new URL('../dist/KeskonMange-V3.html',import.meta.url),port=Number(process.env.PORT??4173);
createServer(async(req,res)=>{
  if(req.url!=='/'&&req.url!=='/KeskonMange-V3.html'){res.writeHead(404);res.end('Page introuvable');return;}
  try {res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(await readFile(html));}
  catch{res.writeHead(503);res.end('Application à construire avec npm run build.');}
}).listen(port,'127.0.0.1',()=>console.log(`KeskonMange V3 : http://127.0.0.1:${port} (local, aucun déploiement)`));
