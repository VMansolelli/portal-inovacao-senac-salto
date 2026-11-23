import test from 'node:test';
import assert from 'node:assert/strict';
import {createPortal} from './server.js';
test('Totem público, edição pela Inovação e inscrição na oficina',async t=>{
 const calls=[];
 const app=createPortal({FRONTEND_ORIGIN:'https://portal.example',SUPABASE_URL:'https://db.example',ADMIN_USER_ID:'victor',SUPABASE_SECRET_KEY:'key',SUPABASE_PUBLISHABLE_KEY:'pub'},async(url,opt)=>{
  if(url.pathname==='/auth/v1/user')return Response.json({id:'victor',email_confirmed_at:'2026-01-01'});
  if(url.pathname.includes('/upload/sign/'))return Response.json({url:url.pathname+'?token=teste'});
  assert.equal(url.pathname,'/rest/v1/rpc/totem_api');
  const d=JSON.parse(opt.body);calls.push(d);
  if(['tela','editor'].includes(d.op))return Response.json({avisos:[{arquivo:'abc.mp4'}],aulas:[]});
  if(d.op==='inscrever')return Response.json({conflict:'Lotada'});
  return Response.json({ok:true});
 });
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(end=>app.close(end)));
 const api=(op,d,login)=>fetch('http://127.0.0.1:'+app.address().port+'/api/'+op,{method:d?'POST':'GET',headers:{'Content-Type':'application/json',...(login?{cookie:'__Host-portal=sessao'}:{})},body:d&&JSON.stringify(d)});
 assert.match((await (await api('totem')).json()).avisos[0].video,/storage\/v1\/object\/public/);
 assert.equal((await api('admin/totem')).status,403);
 assert.equal((await api('admin/totem/upload',{mime:'video/mp4',bytes:500})).status,403);
 assert.equal((await api('admin/totem/upload',{mime:'text/html',bytes:500},true)).status,400);
 const up=await (await api('admin/totem/upload',{mime:'video/mp4',bytes:500},true)).json();assert.match(up.arquivo,/^[0-9a-f]{32}\.mp4$/);
 assert.equal((await api('admin/totem/visibilidade',{id:'n',oculto:true},true)).status,200);
 assert.equal((await api('totem/inscrever',{nome:'A',email:'abc@example.org',workshop:'w',inscritos:0})).status,409);
 assert.equal(calls.at(-1).p.inscritos,undefined);
});
