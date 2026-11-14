import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const port=Number(process.argv[2]||43830);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Port local invalide.');
const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end();return;}
  if(req.url!=='/'&&req.url!=='/index.html'){res.writeHead(404);res.end();return;}
  const html=await readFile(new URL('../dist/KeskonMange-V3.html',import.meta.url));
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);
});
server.listen(port,'127.0.0.1',()=>console.log(`http://127.0.0.1:${port} — environnement local isolé`));
