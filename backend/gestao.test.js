import test from 'node:test';
import assert from 'node:assert/strict';
import {createPortal} from './server.js';

test('Apoio pode conceder acesso e apenas a conta principal pode revogar',async t=>{
 const config={FRONTEND_ORIGIN:'https://portal.example',SUPABASE_URL:'https://db.example',ADMIN_USER_ID:'principal',SUPABASE_SECRET_KEY:'key',SUPABASE_PUBLISHABLE_KEY:'pub'};
 const app=createPortal(config,async(url,opt)=>{
   if(url.pathname==='/auth/v1/user')return Response.json({id:opt.headers.Authorization.slice(7),email_confirmed_at:'2026-01-01'});
   const {op,p}=JSON.parse(opt.body);
   if(op==='autorizado')return Response.json(p.uid==='apoio');
   if(op==='master/lista')return Response.json([]);
   if(op==='revogar-mapa')assert.equal(p.principal,'principal');
   return Response.json({ok:true});
 });
 await new Promise(ok=>app.listen(0,'127.0.0.1',ok));t.after(()=>new Promise(ok=>app.close(ok)));
 const api=(conta,op,post=true)=>fetch('http://127.0.0.1:'+app.address().port+'/api/'+op,{method:post?'POST':'GET',headers:{cookie:'__Host-portal='+conta,'Content-Type':'application/json'},body:post?JSON.stringify({id:'teste'}):undefined});
 assert.equal((await api('apoio','mapa/master/lista',false)).status,200);
 assert.equal((await api('apoio','mapa/master/aprovar')).status,200);
 assert.equal((await api('visitante','mapa/master/aprovar')).status,403);
 assert.equal((await api('apoio','mapa/master/revogar')).status,403);
 assert.equal((await api('principal','mapa/master/revogar')).status,200);
 assert.equal((await api('apoio','master/aprovar')).status,403);
});
