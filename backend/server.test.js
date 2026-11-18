import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createPortal} from './server.js';
import {workshop} from './validation.js';

test('API pública, login, autorização, inscrições e logout',async t=>{
  const user={id:'admin-id',email_confirmed_at:'2026-01-01'};
  const calls=[];
  async function supabase(url,opts){
    const data=opts.body?JSON.parse(opts.body):{};
    if(url.pathname==='/auth/v1/token')return Response.json({user,expires_in:3600,access_token:'admin-token'});
    if(url.pathname==='/auth/v1/logout')return Response.json({});
    if(url.pathname==='/auth/v1/user'){
      const current=opts.headers.Authorization==='Bearer admin-token'?user:{...user,id:'another'};
      return Response.json(current);
    }
    assert.equal(url.pathname,'/rest/v1/rpc/portal_api');
    assert.equal(opts.headers.apikey,'test-secret');
    calls.push(data);
    if(data.op==='inscrever')return Response.json({conflict:'Lotada'});
    return Response.json([]);
  }
  const s=createPortal({FRONTEND_ORIGIN:'https://portal.example',SUPABASE_URL:'https://db.example',ADMIN_USER_ID:user.id,SUPABASE_PUBLISHABLE_KEY:'test-public',SUPABASE_SECRET_KEY:'test-secret'},supabase);
  s.listen(0,'127.0.0.1');await once(s,'listening');
  t.after(()=>new Promise(done=>s.close(done)));
  const base='http://127.0.0.1:'+s.address().port+'/api/';
  function req(path,body,headers={}){
    return fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},body:body&&JSON.stringify(body)});
  }
  assert.equal((await req('publico')).status,200);
  assert.equal((await req('admin/lista')).status,403);
  assert.equal((await req('admin/lista',null,{cookie:'__Host-portal=outsider'})).status,403);
  const login=await req('entrar',{email:'admin@example.org',senha:'test'});
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie');
  assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);
  const headers={cookie:cookie.split(';')[0],origin:'https://portal.example'};
  assert.equal((await req('admin/lista',null,headers)).status,200);
  assert.equal((await req('admin/inscritos/abc',null,headers)).status,200);
  assert.deepEqual(calls.at(-1),{op:'admin/inscritos',p:{id:'abc'}});
  assert.equal((await req('admin/moderar',{id:'abc',status:'aprovada'},{...headers,origin:'https://outro.example'})).status,403);
  assert.equal((await req('admin/moderar',{id:'abc',status:'aprovada'},headers)).status,200);
  assert.equal((await req('inscrever',{workshop:'abc',email:'x@example.org',nome:'Aluno'})).status,409);
  assert.equal((await req('oficina',{})).status,400);
  const send=await req('ideia',{texto:'Teste',perfil:'Aluno',categoria:'Outro',status:'aprovada'});
  assert.equal(send.status,201);assert.equal(calls.at(-1).p.status,undefined);
  assert.match((await req('sair',{},headers)).headers.get('set-cookie'),/Max-Age=0/);
});
test('Oficina exige vagas, e-mail e horário válido',()=>{
  const w={titulo:'Arte',docente:'Docente',email:'docente@example.org',area:'Arte',data:'2026-12-01',inicio:'10:00',termino:'11:00',local:'Biblioteca',vagas:4};
  assert.equal(workshop(w).vagas,4);
  for(const change of [{vagas:0},{email:''},{termino:'09:00'},{data:'2026-02-31'}]){
    assert.throws(()=>workshop({...w,...change}));
  }
});
