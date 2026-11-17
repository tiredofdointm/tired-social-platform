import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await build({entryPoints:['src/main.tsx'],outfile:'dist/app.js',bundle:true,minify:true,format:'esm',platform:'browser',jsx:'automatic',target:'es2022',define:{'process.env.NODE_ENV':'"production"'}});
await build({entryPoints:['src/model.ts'],outfile:'dist/model.js',bundle:true,format:'esm',platform:'node',target:'node22'});
await Promise.all(['index.html','styles.css'].map(file=>copyFile('public/'+file,'dist/'+file)));
