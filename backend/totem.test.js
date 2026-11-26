import test from 'node:test';
import assert from 'node:assert/strict';
import {createPortal} from './server.js';
test('Totem público, edição pela Inovação e inscrição na oficina',async t=>{
 const calls=[];
 const app=createPortal({FRONTEND_ORIGIN:'https://portal.example',SUPABASE_URL:'https://db.example',ADMIN_USER_ID:'victor',SUPABASE_SECRET_KEY:'key',SUPABASE_PUBLISHABLE_KEY:'pub'},async(url,opt)=>{
  if(url.pathname==='/auth/v1/user')return Response.json({id:'victor',email_confirmed_at:'2026-01-01'});
  if(url.pathname.includes('/upload/sign/'))return Response.json({url:url.pathname+'?token=teste'});
  if(url.pathname==='/rest/v1/rpc/fotos_comunidade_api'){
    const d=JSON.parse(opt.body);calls.push(d);
    if(d.op==='publica')return Response.json(null);
    if(d.op==='revisao')return Response.json('data:image/jpeg;base64,/9j/AAAA');
    return Response.json({ok:true});
  }
  assert.equal(url.pathname,'/rest/v1/rpc/totem_api');
  const d=JSON.parse(opt.body);calls.push(d);
  if(['tela','editor'].includes(d.op))return Response.json({avisos:[{arquivo:'abc.mp4'}],aulas:[]});
  if(d.op==='inscrever')return Response.json({conflict:'Lotada'});
  return Response.json({ok:true});
 });
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(end=>app.close(end)));
 const api=(op,d,login)=>fetch('http://127.0.0.1:'+app.address().port+'/api/'+op,{method:d?'POST':'GET',headers:{'Content-Type':'application/json',...(login?{cookie:'__Host-portal=sessao'}:{})},body:d&&JSON.stringify(d)});
 assert.match((await (await api('totem')).json()).avisos[0].video,/storage\/v1\/object\/public/);
 const reel={tipo:'Reel',titulo:'O que o hip hop tem a ver com o #JeitoSenacDeEducar?',inicio:'2026-11-23',fim:'2026-11-25',instagram_reel:'https://www.instagram.com/reel/CxmAbiotTj4/?utm_source=ig_web_button_share_sheet',arquivo:''};
 assert.equal((await api('admin/totem/aviso',reel,true)).status,400);
 reel.arquivo='a'.repeat(32)+'.mp4';
 assert.equal((await api('admin/totem/aviso',reel,true)).status,200);
 assert.equal(calls.at(-1).p.instagram_reel,'https://www.instagram.com/reel/CxmAbiotTj4/');
 assert.equal(calls.at(-1).p.arquivo,reel.arquivo);
 assert.equal((await api('admin/totem/aviso',{...reel,fim:'2026-11-22'},true)).status,400);
 assert.equal((await (await api('totem/versao')).json()).reelPorLink,false);
 const imagem={...reel,tipo:'Curso',imagem_curso:'https://portal.example/curso.jpg',segundos:42};
 assert.equal((await api('admin/totem/aviso',imagem,true)).status,200);
 assert.equal(calls.at(-1).p.segundos,42);
 assert.equal((await api('admin/totem/aviso',{...imagem,segundos:0},true)).status,400);
 const ambientes=Array.from({length:4},(_,i)=>({nome:'Local '+i,horario:'8h às 12h',telefone:'1234'}));
 assert.equal((await api('admin/totem/horarios',{ambientes},true)).status,200);
 assert.deepEqual(calls.at(-1).p.ambientes,ambientes);
 assert.equal((await api('admin/totem')).status,403);
 assert.equal((await api('admin/totem/upload',{mime:'video/mp4',bytes:500})).status,403);
 assert.equal((await api('admin/totem/upload',{mime:'text/html',bytes:500},true)).status,400);
 const up=await (await api('admin/totem/upload',{mime:'video/mp4',bytes:500},true)).json();assert.match(up.arquivo,/^[0-9a-f]{32}\.mp4$/);
 assert.equal((await api('admin/totem/visibilidade',{id:'n',oculto:true},true)).status,200);
 assert.equal((await api('totem/inscrever',{nome:'A',email:'abc@example.org',workshop:'w',inscritos:0})).status,409);
 assert.equal(calls.at(-1).p.inscritos,undefined);
 const id='00000000-1111-2222-3333-444444444444';
 const foto={imagem:'data:image/jpeg;base64,/9j/AAAA',aceite:true};
 assert.equal((await api('galeria/enviar',{...foto,aceite:false})).status,400);
 assert.equal((await api('galeria/enviar',foto)).status,201);
 assert.equal(calls.at(-1).op,'enviar');
 assert.equal((await api('galeria/'+id)).status,404);
 assert.equal(calls.at(-1).op,'publica');
 assert.equal((await api('admin/totem/galeria/'+id)).status,403);
 assert.equal((await api('admin/totem/galeria/'+id,undefined,true)).status,200);
 assert.equal((await api('admin/totem/galeria/decidir',{id,decisao:'aprovar'})).status,403);
 assert.equal((await api('admin/totem/galeria/decidir',{id,decisao:'aprovar'},true)).status,200);
 assert.equal(calls.at(-1).op,'aprovar');
 for(const decisao of ['excluir','reexibir']){
   assert.equal((await api('admin/totem/galeria/decidir',{id,decisao,estado:'arquivada'},true)).status,200);
   assert.deepEqual(calls.at(-1),{op:decisao,p:{id,estado:'arquivada'}});
 }
});
