import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const bundle=await build({entryPoints:[new URL('src/app.mjs',root).pathname],bundle:true,write:false,format:'iife',
  target:['es2022'],minify:true,legalComments:'none',charset:'utf8',logLevel:'warning'});
const [template,css]=await Promise.all([readFile(new URL('index.html',root),'utf8'),readFile(new URL('src/style.css',root),'utf8')]);
const html=template.replace('/* APP_CSS */',css).replace('/* APP_JS */',bundle.outputFiles[0].text.replace(/<\/script/gi,'<\\/script'));
await mkdir(new URL('dist/',root),{recursive:true});
await writeFile(new URL('dist/KeskonMange-V3.html',root),html);
console.log(`Application autonome : v3/app/dist/KeskonMange-V3.html (${Buffer.byteLength(html)} octets). Aucun accès réseau requis.`);
