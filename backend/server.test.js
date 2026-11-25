import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createPortal} from './server.js';
import {workshop,salas} from './validation.js';

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
    if(url.pathname==='/rest/v1/rpc/portal_areas_api'){
      if(data.op==='perfil')return Response.json(null);
      if(data.op==='moderar'){calls.push(data);return Response.json({ok:true});}
    }
    if(url.pathname==='/rest/v1/rpc/mapa_api')return Response.json(data.op==='salas'?[...salas]:false);
    if(url.pathname==='/rest/v1/rpc/chaves_excel_api'){calls.push(data);return Response.json({ok:true});}
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
  assert.equal((await req('mapa/perfil',null,headers)).status,200);
  assert.equal((await req('mapa/perfil',null,{cookie:'__Host-portal=outsider'})).status,403);
  assert.equal((await req('mapa/cadastro',{tipo:'sala',nome:'Sala de teste'})).status,403);
  assert.equal((await req('mapa/master/lista')).status,403);
  assert.equal((await req('admin/inscritos/abc',null,headers)).status,200);
  assert.deepEqual(calls.at(-1),{op:'admin/inscritos',p:{id:'abc'}});
  assert.equal((await req('admin/moderar',{id:'abc',status:'aprovada'},{...headers,origin:'https://outro.example'})).status,403);
  assert.equal((await req('admin/moderar',{id:'abc',status:'aprovada'},headers)).status,200);
  assert.equal((await req('inscrever',{workshop:'abc',email:'x@example.org',nome:'Aluno'})).status,409);
  assert.equal((await req('oficina',{})).status,400);
  const oficina={id:'of1',titulo:'Oficina',docente:'Docente',email:'docente@example.org',area:'Arte',data:'2026-12-04',inicio:'14:00',termino:'17:30',local:'Lab Software 8',vagas:38};
  for(const imagem of ['data:image/jpeg;base64,/9j/AA==','data:image/jpeg;base64,/9j/AQ==',undefined]){
    assert.equal((await req('admin/editar',{...oficina,imagem},headers)).status,200);
    assert.equal(calls.at(-1).p.imagem,imagem);
  }
  const mov={nome:'Nome informado',indice:0,revisao:'11111111-1111-4111-8111-111111111111',pedido:'22222222-2222-4222-8222-222222222222'};
  assert.equal((await req('mapa/balcao',{})).status,200);
  assert.equal((await req('mapa/pegar',mov)).status,200);
  assert.equal(calls.at(-1).p.nome,mov.nome);
  assert.equal((await req('mapa/pegar',{...mov,nome:' '})).status,400);
  assert.equal((await req('mapa/entregar',{id:mov.pedido,nome:'Outra pessoa'})).status,200);
  assert.equal((await req('mapa/relatorio',{data:'2026-11-25'})).status,403);
  assert.equal((await req('mapa/relatorio',{data:'2026-11-25'},headers)).status,200);
  const noticia={id:'abc',titulo:'Projeto',turma:'T1',curso:'TI',descricao:'Texto',categoria:'Outro'};
  assert.equal((await req('admin/editar-noticia',noticia)).status,403);
  assert.equal((await req('admin/editar-noticia',noticia,headers)).status,200);
  assert.equal(calls.at(-1).op,'admin/editar-noticia');
  assert.equal(calls.at(-1).p.imagem,undefined);
  const institucional={titulo:'Exposição aberta',descricao:'Convite à comunidade',categoria:'Evento'};
  for(const extras of [{},{turma:'T1'},{curso:'TI'},{turma:'',curso:''}]){
    assert.equal((await req('noticia',{...institucional,...extras,imagem:'data:image/jpeg;base64,/9j/AA=='})).status,201);
    assert.equal(calls.at(-1).p.turma,extras.turma||'');
    assert.equal(calls.at(-1).p.curso,extras.curso||'');
  }
  assert.equal((await req('admin/editar-noticia',{...institucional,id:'abc',turma:'',curso:''},headers)).status,200);
  assert.equal(calls.at(-1).p.curso,'');
  assert.equal(calls.at(-1).p.turma,'');
  assert.equal((await req('admin/excluir-noticia',{id:'abc'})).status,403);
  assert.equal((await req('admin/excluir-noticia',{id:'abc'},headers)).status,200);
  assert.equal(calls.at(-1).op,'admin/excluir-noticia');
  assert.deepEqual(await (await req('salas')).json(),[...salas]);
  const send=await req('ideia',{texto:'Teste',perfil:'Aluno',categoria:'Outro',status:'aprovada'});
  assert.equal(send.status,201);assert.equal(calls.at(-1).p.status,undefined);
  assert.match((await req('sair',{},headers)).headers.get('set-cookie'),/Max-Age=0/);
});
test('Oficina exige vagas, e-mail e horário válido',()=>{
  const w={titulo:'Arte',docente:'Docente',email:'docente@example.org',area:'Arte',data:'2026-12-01',inicio:'10:00',termino:'11:00',local:'Biblioteca',vagas:4};
  assert.equal(workshop(w).vagas,4);
  assert.equal(salas.size,19);
  for(const [local,max] of salas){
    assert.equal(workshop({...w,local,vagas:max}).vagas,max);
    assert.throws(()=>workshop({...w,local,vagas:max+1}));
  }
  assert.throws(()=>workshop({...w,local:'Sala antiga'}));

  for(const change of [{vagas:0},{email:''},{termino:'09:00'},{data:'2026-02-31'}]){
    assert.throws(()=>workshop({...w,...change}));
  }
});

test('Recuperação por link e autorização de administradores adicionais',async ()=>{
  const calls=[];
  const current={id:'segundo',email_confirmed_at:'2026-01-01'};
  const server=createPortal({FRONTEND_ORIGIN:'https://portal.example',SUPABASE_URL:'https://db.example',ADMIN_USER_ID:'principal',ADMIN_USER_IDS:' segundo , terceiro ',SUPABASE_PUBLISHABLE_KEY:'test',SUPABASE_SECRET_KEY:'test'},async(url,opts)=>{
    const body=JSON.parse(opts.body||'{}');
    calls.push([url.pathname,opts.method,body]);
    if(url.pathname.endsWith('/user') && opts.method!=='PUT'){
      if(opts.headers.Authorization==='Bearer expirado')return Response.json({}, {status:403});
      return Response.json(opts.headers.Authorization==='Bearer fora'?{...current,id:'fora'}:current);
    }
    if(url.pathname.endsWith('/token'))return Response.json({access_token:'token',user:current,expires_in:3600});
    return Response.json({});
  });
  async function post(op,body){
    const req={method:'POST',url:'/api/'+op,headers:{'content-type':'application/json'},
      async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(body));}};
    let status;
    const res={setHeader(){},writeHead(code){status=code;},end(){}};
    await server.listeners('request')[0](req,res);return status;
  }
  const info={email:'docente@example.org',senha:'nova-senha-123'};
  assert.equal(await post('entrar',info),200);
  assert.equal(await post('recuperar',info),200);
  for(const [token,status] of [['expirado',403],['fora',403],['valido',200]]){
    assert.equal(await post('redefinir',{...info,token}),status);
  }
  assert.equal(calls.filter(([path,method])=>path.endsWith('/user') && method==='PUT').length,1);
  assert.ok(calls.some(([path])=>path.endsWith('/recover')));
});

test('Solicitação, aprovação exclusiva do master e ativação',async t=>{
  const users={victor:{id:'owner',email_confirmed_at:'ok'},colega:{id:'staff',email_confirmed_at:'ok'}};
  let grant=false,inviteHash,requestCount=0,activationCount=0;
  const remote=async(url,opts)=>{
    const b=opts.body && JSON.parse(opts.body);
    if(url.pathname==='/auth/v1/user')return Response.json(users[opts.headers.Authorization.slice(7)]||{});
    if(url.pathname==='/auth/v1/admin/users')return Response.json({id:'novo'});
    if(url.pathname==='/rest/v1/rpc/portal_areas_api'){
      if(b.op==='perfil')return Response.json(b.p.uid==='staff'?'inovacao':b.p.uid==='redator'?'totem':null);
      if(b.op==='solicitar'){requestCount++;return Response.json({ok:true});}
      if(b.op==='master/aprovar'){inviteHash=b.p.digest;return Response.json({ok:true});}
      if(b.op==='moderar'){assert.equal(b.p.kind,'noticia');return Response.json({ok:true});}
    }
    assert.equal(url.pathname,'/rest/v1/rpc/portal_api');
    switch(b.op){
      case 'solicitar':requestCount++;return Response.json({ok:true});
      case 'master/aprovar':inviteHash=b.p.digest;return Response.json({ok:true});
      case 'master/lista':return Response.json([]);
      case 'autorizado':return Response.json(grant && b.p.uid==='novo');
      case 'validar-convite':return Response.json(!grant && b.p.digest===inviteHash);
      case 'ativar':assert.equal(b.p.uid,'novo');grant=true;activationCount++;return Response.json({ok:true});
      default:return Response.json({ok:true});
    }
  };
  const s=createPortal({FRONTEND_ORIGIN:'https://portal.example',SUPABASE_URL:'https://db.example',ADMIN_USER_ID:'owner',ADMIN_USER_IDS:'staff',SUPABASE_PUBLISHABLE_KEY:'pk',SUPABASE_SECRET_KEY:'sk'},remote);
  s.listen(0,'127.0.0.1');await once(s,'listening');t.after(()=>new Promise(done=>s.close(done)));
  const call=(route,user,body)=>fetch('http://127.0.0.1:'+s.address().port+'/api/'+route,{method:body?'POST':'GET',headers:{cookie:'__Host-portal='+user,'content-type':'application/json'},body:body&&JSON.stringify(body)});
  users.redator={id:'redator',email_confirmed_at:'ok'};
  assert.equal((await call('admin/editar-acao','redator',{id:'teste'})).status,403);
  assert.equal((await call('admin/inscritos/noticia','redator')).status,403);
  assert.equal((await call('admin/totem','colega')).status,403);
  assert.equal((await call('admin/editar-noticia','colega',{id:'teste'})).status,403);
  assert.equal((await call('admin/moderar','redator',{id:'teste',status:'aprovada'})).status,403);
  assert.equal((await call('admin/moderar-noticia','redator',{id:'teste',status:'aprovada'})).status,200);
  const data={nome:'Colega',email:'colega@sp.senac.br'};
  assert.equal((await call('solicitar','',data)).status,200);assert.equal(requestCount,1);
  for(const u of ['','colega']){
    assert.equal((await call('master/lista',u)).status,403);
    assert.equal((await call('master/aprovar',u,{id:'1'})).status,403);
    assert.equal((await call('master/rejeitar',u,{id:'1'})).status,403);
  }
  assert.deepEqual(await (await call('admin/perfil','colega')).json(),{master:false});
  assert.deepEqual(await (await call('admin/perfil','victor')).json(),{master:true});
  const {codigo}=await (await call('master/aprovar','victor',{id:'1'})).json();
  assert.ok(codigo && codigo!==inviteHash);
  const accept={...data,codigo,senha:'senha-ficticia-123'};
  assert.equal((await call('ativar','',{...accept,codigo:'invalido'})).status,403);
  assert.equal((await call('ativar','',accept)).status,200);
  assert.equal((await call('ativar','',accept)).status,403);assert.equal(activationCount,1);
  for(const op of ['editar-acao','excluir-oficina','apagar-ideia','arquivar-ideia','arquivar-noticia'])
    assert.equal((await call('admin/'+op,'',{id:'1'})).status,403);
  const backup=await (await call('admin/reserva','victor',{})).json();assert.ok(backup.codigo.length>=32);
});
