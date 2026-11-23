'use strict';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nowDay=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
const br=d=>d?.split('-').reverse().join('/')||'';
const time=t=>t?.slice(0,5)||'';
const stamp=t=>t?new Date(t).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'';
const offset=(d,n)=>new Date(Date.parse(d+'T12:00Z')+n*86400000).toISOString().slice(0,10);
const btn=(label,action,id='',css='')=>`<button type="button" class="${css}" ${action==='prev'?'aria-label="Data anterior"':action==='next'?'aria-label="Próxima data"':''} data-action="${action}" data-id="${esc(id)}">${esc(label)}</button>`;
const input=(label,name,type='text',value='',attrs='required')=>`<label>${label}<input type="${type}" name="${name}" value="${esc(value)}" ${attrs}></label>`;
const select=(label,name,items,selected='',required=true)=>`<label>${label}<select name="${name}" ${required?'required':''}><option value="">Selecione</option>${items.map(([v,l])=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`;
const submit=t=>`<button class="accent" type="submit">${esc(t)}</button>`;
const labelType={sala:'Salas',curso:'Cursos',turma:'Turmas',docente:'Docentes'};
const tabs={agenda:'Reservas',cadastros:'Cadastros',calendario:'Calendário',chaves:'Chaves e histórico',acessos:'Permissões'};
let staff=null,pin='',activeTab='agenda',date=nowDay(),week=false,category='sala',catalog=[],board={},leases=[],generation=0;
const desk=()=>location.hash==='#chaves';
function say(msg){$('#status').textContent=msg;}
async function api(action,data){
 const r=await fetch('/api/'+(action==='sair'?'sair':'mapa/'+action),data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{cache:'no-store'});
 let result;try{result=await r.json();}catch{throw Error('Serviço indisponível. Confira o deploy do backend.');}
 if(!r.ok)throw Object.assign(Error(result.erro||'Operação indisponível.'),{status:r.status});return result;
}

function formWire(form,fn,feedback){
 form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('button[type=submit]');if(b.disabled)return;b.disabled=true;feedback.textContent='';
  try{await fn(Object.fromEntries(new FormData(form)),form);}catch(err){feedback.textContent=err.message;}finally{b.disabled=false;}};
}
function modal(title,markup,fn,buttonText='Salvar'){
 const dlg=$('#modal');$('#title').textContent=title;$('#error').textContent='';
 $('#dialogContent').innerHTML=fn?`<form class="form">${markup}${submit(buttonText)}</form>`:markup;
 if(!dlg.open)dlg.showModal();
 if(fn)formWire($('#dialogContent form'),fn,$('#error'));
 return $('#dialogContent form');
}
function done(msg){$('#modal').close();say(msg);return render();}
function codeBox(title,code,note){modal(title,`<p>${esc(note)}</p><label>Código<input value="${esc(code)}" readonly></label>`);}
$('#close').onclick=()=>$('#modal').close();
$('#modal').onclose=()=>$('#dialogContent').replaceChildren();
$('#print').onclick=()=>window.print();
async function entry(){
 generation++;pin='';staff=null;date=nowDay();document.body.classList.toggle('desk',desk());
 $('h1').textContent=desk()?'Balcão de chaves':'Mapa de salas';
 $('#campus').textContent=desk()?'Senac Salto · Docentes':'Senac Salto · Apoio';
 $('.switch').textContent=desk()?'Área do Apoio':'Balcão docente';$('.switch').href=desk()?'#':'#chaves';say('');$('#page').textContent='Carregando…';$('#tabs').innerHTML='';$('#print').hidden=true;$('#sair').hidden=true;
 if(!desk())try{staff=await api('perfil');}catch(err){if(err.status!==403)say(err.message);}
 await render();
}
function gate(){
 const isDesk=desk();
 if(isDesk){
 $('#page').innerHTML='<section class="pin-card"><h2>Consultar minha reserva</h2><p>Digite seu PIN para retirar ou devolver a chave.</p><form class="form">'+input('PIN do docente','pin','password','','required inputmode="numeric" pattern="([0-9]{4}|[0-9]{10})" maxlength="10" placeholder="Digite seu PIN" autocomplete="off"')+submit('Ver minhas reservas')+'</form><p role="alert" class="gate-error"></p></section>';
 formWire($('#page form'),async d=>{await api('pin-dia',{pin:d.pin,data:date});pin=d.pin;resetTimer();say('');await render();},$('.gate-error'));
 return;
 }
 $('#page').innerHTML='<div class="card"><h2>Acesso do Apoio</h2><form class="form">'+input('E-mail institucional','email','email')+input('Senha','senha','password','','required autocomplete="current-password"')+submit('Entrar')+'</form>'+btn('Solicitar acesso','solicitar')+btn('Ativar convite','ativar')+'<p role="alert" class="gate-error"></p></div>';
 formWire($('#page form'),async d=>{await api('entrar',d);staff=await api('perfil');say('');await render();},$('.gate-error'));
}
async function render(){
 const run=++generation,mode=desk();
 $('#sair').hidden=mode?!pin:!staff;
 if(mode?!pin:!staff){$('#print').hidden=true;$('#tabs').replaceChildren();gate();return;}
 $('#tabs').innerHTML=mode?'':Object.entries(tabs).filter(([k])=>k!=='acessos'||staff.master).map(([k,v])=>`<button data-action="tab" data-id="${k}" aria-current="${activeTab===k?'page':'false'}">${v}</button>`).join('');
 $('#print').hidden=true;
 try{
 if(mode||activeTab==='agenda'){
  const data=await api(mode?'pin-dia':'dia',{data:date,semana:!mode&&week,...(mode?{pin}:{})});
  if(run!==generation)return;
  board=data;if(mode)await showDesk();else {showBoard(false);$('#print').hidden=false;}
 }else if(activeTab==='cadastros'){
  const c=await api('catalogo');if(run!==generation)return;catalog=c;showCatalog();
 }else if(activeTab==='calendario'){
  const entries=await api('recessos');if(run!==generation)return;
  $('#page').innerHTML=tools('Dias sem aula',btn('Adicionar recesso','recesso','','primary'))+'<p>Feriados nacionais, de São Paulo e de Salto são aplicados na criação das aulas. Inclua pontes e recessos específicos da unidade.</p>'+entries.map(r=>row(br(r.dia),r.motivo,btn('Remover','remover-recesso',r.dia))).join('');
 }else if(activeTab==='chaves'){
  const data=await api('historico',{data:date});if(run!==generation)return;leases=data;
  $('#page').innerHTML=tools('Movimentação das chaves',dateField()+btn('QR do balcão','qr')+(staff.master?btn('Gerar PIN administrativo','pin','admin'):''))+
   '<p>Movimentos da data selecionada e todas as retiradas ainda abertas.</p>'+ (leases.map(k=>row(k.sala,'Retirada por '+k.retirante+' · '+stamp(k.retirada)+(k.devolucao?' | Devolvida por '+k.devolvente+' · '+stamp(k.devolucao):' | Em uso')+(k.nota?' | '+k.nota:''),k.devolucao?'':btn('Registrar correção','corrigir',k.id))).join('')||'<p>Nenhum movimento.</p>');
 }else{
  const list=await api('master/lista');if(run!==generation)return;
  $('#page').innerHTML=tools('Permissões do Apoio','')+(list.map(x=>row(x.nome,x.email+' · '+x.estado,x.estado==='ativa'?'':btn('Aprovar / emitir convite','master/aprovar',x.id)+btn('Rejeitar','master/rejeitar',x.id))).join('')||'<p>Nenhuma solicitação. Apenas sua conta tem acesso inicialmente.</p>');
 }
 }catch(err){if(run===generation){if(err.status===403){staff=null;pin='';say(err.message);return render();}$('#page').innerHTML=btn('Tentar novamente','retry');say(err.message);}}
}
const tools=(title,buttons)=>`<div class="tools no-print"><h2>${esc(title)}</h2>${buttons}</div>`;
const row=(title,sub,actions)=>`<article class="row"><div><strong>${esc(title)}</strong><p class="muted">${esc(sub)}</p></div><div class="buttons">${actions}</div></article>`;
const dateField=()=>`<label>Data<input id="date" type="date" value="${date}" required></label>`;
const detailLine=r=>esc([r.turma_nome||r.titulo,r.curso_nome,r.professores].filter(Boolean).join(' · '));
async function showDesk(){
 const run=generation;const daily=date===board.hoje?board:await api('pin-dia',{pin,data:board.hoje});if(run!==generation)return;
 const mine=daily.reservas.filter(r=>r.podeRetirar);
 const returns=board.salas.filter(r=>r.ocupada&&r.podeDevolver);
 const card=(room,sub,action)=>'<article class="ticket"><div class="ticket-main"><h3>'+esc(room.nome)+'</h3><p>'+sub+'</p></div>'+action+'</article>';
 let html='<div class="desk-list"><h2>Minhas chaves</h2><p>'+br(board.hoje)+'</p>';
 for(const room of returns)html+=card(room,'Chave retirada',btn('Devolver chave','devolver',room.id,'primary'));
 for(const r of mine){const room=board.salas.find(s=>s.id===r.sala);if(returns.includes(room))continue;html+=card(room,'<b>'+time(r.inicio)+' – '+time(r.fim)+'</b><br>'+detailLine(r),room.ocupada?'Chave já retirada':btn('Retirar chave','retirar',r.id,'accent'));}
 if(!returns.length&&!mine.length)html+='<p>Nenhuma chave pendente ou reserva sua para hoje.</p>';
 if(board.adminPin)html+='<details><summary>Retirada administrativa por sala</summary>'+board.salas.filter(s=>!s.ocupada).map(s=>card(s,'Chave disponível',btn('Retirar sem reserva','livre',s.id))).join('')+'</details>';
 html+='<details class="consult"><summary>Consultar o mapa por data</summary>'+dateField()+board.reservas.map(r=>card({nome:r.sala_nome},time(r.inicio)+' – '+time(r.fim)+'<br>'+detailLine(r),'')).join('')+(board.reservas.length?'':'<p>Sem reservas nesta data.</p>')+'</details></div>';
 $('#page').innerHTML=html;
 if(date!==board.hoje)$('.consult').open=true;
}
function showBoard(mode){
 const weekly=week&&!mode;
 const title=br(date)+(weekly?' a '+br(offset(date,6)):'');
 let html=tools(mode?'Consulta e chaves':'Agenda de salas',btn('‹','prev')+dateField()+btn('›','next')+(mode?'':btn(weekly?'Ver dia':'Ver 7 dias','week')+btn('Reservar sala','nova','','primary')))+`<h2>${title}</h2>`;
 const days=Array.from({length:weekly?7:1},(_,i)=>offset(date,i));
 for(const note of [...board.feriados,...board.recessos.map(x=>({data:x.dia,nome:x.motivo}))].filter(x=>days.includes(x.data)))html+=`<p>${br(note.data)} · ${esc(note.nome)}</p>`;
 const columns=weekly?days.map(d=>br(d)) : ['Manhã','Tarde','Noite'];
 const rooms=[...board.salas];
 for(const r of board.reservas)if(!rooms.some(s=>s.id===r.sala))rooms.push({id:r.sala,nome:r.sala_nome});
 rooms.sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR',{numeric:true}));
 html+='<div class="board"><table><thead><tr><th>Sala</th>'+columns.map(c=>'<th>'+c+'</th>').join('')+'</tr></thead><tbody>';
 for(const room of rooms){
  const current=days.includes(board.hoje),key=room.ocupada;
  const keyText=current?`<span class="badge ${key?'out':''}">${key?'Chave retirada':'Chave disponível'}</span>`:'';
  let adminKey='';
  if(mode && (room.podeDevolver && key || board.adminPin && !key && date===board.hoje)){
    adminKey=btn(key?'Devolver':'Retirar sem reserva',key?'devolver':'livre',room.id);
  }
  html+=`<tr><th>${esc(room.nome)}${keyText}${adminKey}</th>`;
  for(let i=0;i<columns.length;i++){
   const items=board.reservas.filter(r=>r.sala===room.id && (weekly?r.dia===days[i]:time(r.inicio)<(i===0?'13:00':i===1?'19:00':'24:00') && time(r.fim)>(i===0?'00:00':i===1?'13:00':'19:00')));
   html+='<td>'+items.map(r=>`<div class="slot ${r.tipo==='reuniao'?'meeting':''}"><strong>${esc(r.turma_nome||r.titulo)}</strong><small>${esc(r.curso_nome||'Reunião')}</small><small>${time(r.inicio)}–${time(r.fim)} · ${esc(r.professores)}</small>${mode?(r.podeRetirar&&!key?btn('Retirar chave','retirar',r.id):''):btn('Editar','editar',r.id)+btn('Excluir','cancelar',r.id)}</div>`).join('')+'</td>';
  }
  html+='</tr>';
 }
 const matrix=html.slice(html.indexOf('<div class="board">'))+'</tbody></table></div>';
 const events=[...board.reservas].sort((a,b)=>a.dia.localeCompare(b.dia)||a.inicio.localeCompare(b.inicio));
 const schedule=events.map(r=>'<article class="event"><div class="event-time"><b>'+time(r.inicio)+'</b><span>'+time(r.fim)+'</span></div><div><small>'+esc(weekly?br(r.dia):r.tipo==='aula'?'Aula':'Reunião')+'</small><h3>'+esc(r.sala_nome)+'</h3><p>'+detailLine(r)+'</p></div><div class="buttons">'+btn('Editar','editar',r.id)+btn('Excluir','cancelar',r.id)+'</div></article>').join('');
 const stats='<div class="metrics no-print">'+[[events.length,'Reservas no período'],[new Set(events.map(r=>r.sala)).size,'Salas reservadas'],[board.salas.filter(s=>s.ocupada).length,'Chaves retiradas agora']].map(([n,label])=>'<div><b>'+n+'</b><span>'+label+'</span></div>').join('')+'</div>';
 $('#page').innerHTML=stats+html.slice(0,html.indexOf('<div class="board">'))+'<div class="schedule no-print">'+(schedule||'<p>Sem reservas neste período.</p>')+'</div><details class="matrix no-print"><summary>Ver grade completa de salas</summary>'+matrix+'</details><div class="print-only">'+folhaDiaria(rooms,events,date)+'</div>';
}
function showCatalog(){
 const list=catalog.filter(x=>x.tipo===category);
 $('#page').innerHTML=tools('Cadastros',btn('Adicionar','novo-cadastro','','primary'))+'<div class="buttons">'+Object.entries(labelType).map(([k,v])=>btn(v,'categoria',k,category===k?'primary':'')).join('')+'</div>'+
  list.map(e=>row(e.nome,[e.capacidade?e.capacidade+' lugares':'',catalog.find(x=>x.id===e.curso)?.nome,e.ativo?'Ativo':'Desativado'].filter(Boolean).join(' · '),
  e.ativo?btn('Editar','editar-cadastro',e.id)+(category==='docente'?btn('Gerar PIN','pin',e.id):'')+btn('Desativar','desativar',e.id):btn('Reativar','reativar',e.id))).join('');
}
const options=tipo=>catalog.filter(e=>e.tipo===tipo&&e.ativo).map(e=>[e.id,e.nome]);
const scope=()=>select('Aplicar a','escopo',[['uma','Somente esta aula'],['proximas','Esta e as próximas'],['serie','Toda a série']],'uma');
async function reservation(r){
 catalog=await api('catalogo');
 const chosen=r?.tipo||'aula';
 const shift=r?[['manha','08:00','12:00'],['tarde','13:30','17:30'],['noite','19:00','22:30']].find(x=>x[1]===time(r.inicio)&&x[2]===time(r.fim))?.[0]||'livre':'manha';
 const start=r?.dia||date;
 const f=modal(r?'Editar reserva':'Reservar sala',select('Tipo','tipo',[['aula','Aula'],['reuniao','Reunião']],chosen)+
  select('Sala','sala',options('sala'),r?.sala)+
  '<div id="lesson">'+select('Turma','turma',options('turma'),r?.turma,false)+'</div>'+
  '<div id="meeting">'+input('Assunto da reunião','titulo','text',r?.titulo,'maxlength="180"')+'</div>'+
  '<div class="two">'+select('Docente ou responsável','docente',options('docente'),r?.docentes?.[0],false)+select('Segundo docente','segundo',options('docente'),r?.docentes?.[1],false)+'</div>'+
  select('Turno ou horário','turno',[['manha','Manhã · 08h às 12h'],['tarde','Tarde · 13h30 às 17h30'],['noite','Noite · 19h às 22h30'],['livre','Horário específico']],shift)+
  '<div id="times" class="two">'+input('Início','inicio','time',time(r?.inicio)||'15:00')+input('Fim','fim','time',time(r?.fim)||'16:00')+'</div>'+
  '<div class="two">'+input(r?'Data':'De','data','date',start)+(r?'':input('Até','ate','date',start))+'</div>'+
  (r?scope():'<fieldset><legend>Dias de repetição</legend><div class="checks">'+['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((n,i)=>`<label><input type="checkbox" name="dias" value="${i}" ${i===new Date(start+'T12:00Z').getUTCDay()?'checked':''}>${n}</label>`).join('')+'</div></fieldset>'),async(d,form)=>{
    d.dias=new FormData(form).getAll('dias').map(Number);if(r)d.id=r.id;
    const op=r?'alterar':'criar';let result;
    try{result=await api(op,d);}catch(e){if(!e.message.startsWith('AVISO:')||!confirm(e.message))throw e;result=await api(op,{...d,aceitarAviso:true});}
    await done(result.quantidade+' ocorrência(s) salva(s).'+(result.recessos?' Recessos pulados: '+result.recessos+'.':''));
  });
 function update(){const lesson=f.tipo.value==='aula';$('#lesson').hidden=!lesson;$('#meeting').hidden=lesson;f.turma.required=lesson;f.docente.required=lesson;f.titulo.required=!lesson;$('#times').hidden=f.turno.value!=='livre';}
 f.tipo.onchange=update;f.turno.onchange=update;update();
}
async function act(action,id){
 if(action==='retry')return render();
 if(action==='tab'){activeTab=id;return render();}
 if(action==='categoria'){category=id;return showCatalog();}
 if(action==='week'){week=!week;return render();}
 if(action==='prev'||action==='next'){date=offset(date,(action==='prev'?-1:1)*(week&&!desk()?7:1));return render();}
 if(action==='nova'||action==='editar')return reservation(board.reservas.find(r=>r.id===id));
 if(action==='cancelar')return modal('Excluir reserva',scope(),async d=>{
   if(!confirm('Excluir as ocorrências selecionadas?'))return;
   await api('cancelar',{id,escopo:d.escopo});await done('Reserva excluída.');
 },'Excluir');
 if(action==='novo-cadastro'||action==='editar-cadastro'){
   const r=catalog.find(x=>x.id===id);
   return modal(labelType[category]+' · '+(r?'editar':'adicionar'),input(category==='turma'?'Código da turma (ex.: TI1.26)':'Nome','nome','text',r?.nome,'required maxlength="160"')+
     (category==='sala'?input('Capacidade','capacidade','number',r?.capacidade,'required min="1" max="10000"'):'')+
     (category==='turma'?select('Curso','curso',options('curso'),r?.curso):''),async d=>{
       await api('cadastro',{...d,id,tipo:category});await done('Cadastro salvo.');
     });
 }
 if(action==='reativar'){
   await api(action,{id});await render();
   say(category==='docente'?'Docente reativado. Use Gerar PIN para emitir um novo código.':'Cadastro reativado.');
   return;
 }
 if(action==='desativar'){if(confirm('Desativar este cadastro para novas reservas?')){await api(action,{id});await render();}return;}
 if(action==='pin'){
   if(!confirm('Gerar um novo PIN? O anterior será substituído.'))return;
   const r=await api('pin',{id});return codeBox('Novo PIN',r.pin,'Entregue este PIN pessoalmente ao titular. Ele será exibido apenas agora.');
 }
 if(action==='recesso')return modal('Dia sem aula',input('Data','data','date',date)+input('Motivo','motivo'),async d=>{await api(action,d);await done('Dia sem aula registrado.');});
 if(action==='remover-recesso'){if(confirm('Retirar esta data do calendário de recessos?')){await api(action,{data:id});await render();}return;}
 if(action==='corrigir')return modal('Encerrar retirada com justificativa',input('Justificativa do acerto','motivo','text','','required minlength="4" maxlength="500"'),async d=>{await api(action,{id,...d});await done('Correção registrada no histórico.');});
 if(action==='qr')return modal('QR Code permanente','<p>Fixe este código no balcão. Ele abre a consulta e a movimentação de chaves.</p><img class="qr" src="/mapa-qr.svg" alt="QR do balcão de chaves"><p><a href="/mapa-qr.svg" download="QR-balcao.svg">Baixar QR para impressão</a></p>');
 if(['livre','retirar','devolver'].includes(action)){
   const r=action==='retirar'?(board.reservas.find(x=>x.id===id)||(await api('pin-dia',{pin,data:board.hoje})).reservas.find(x=>x.id===id)):null;
   const room=board.salas.find(x=>x.id===(r?.sala||id));
   const back=action==='devolver';
   return modal(back?'Devolver a chave?':'Retirar a chave?', '<div class="confirm-room"><h3>'+esc(room.nome)+'</h3><p>'+esc(r?time(r.inicio)+'–'+time(r.fim)+' · '+(r.turma_nome||r.titulo):'Balcão de chaves')+'</p></div>'+(board.adminPin?input('Nome do responsável','responsavel'):''),async d=>{
   const responsavel=d.responsavel?.trim()||'';
   if(board.adminPin&&!responsavel)return;
   await api(back?'devolver':'retirar',{responsavel,sala:room.id,reserva:r?.id||'',movimento:room.movimento,pin});
   // End the PIN session on a shared device after each movement.
   pin='';board={};$('#modal').close();say((back?'Devolução':'Retirada')+' registrada · '+room.nome+'.');await render();window.scrollTo(0,0);},back?'Confirmar devolução':'Confirmar retirada');
 }
 if(action==='solicitar')return modal('Solicitar acesso ao Apoio',input('Nome','nome')+input('E-mail institucional','email','email'),async d=>{await api(action,d);await done('Solicitação registrada para avaliação de Victor.');},'Solicitar acesso');
 if(action==='ativar')return modal('Ativar convite do Apoio',input('E-mail','email','email')+input('Convite','codigo')+
   input('Senha (use a atual se já tiver conta)','senha','password','','required minlength="8"'),async d=>{await api(action,d);await done('Acesso ativado. Entre com e-mail e senha.');},'Ativar');
 if(action.startsWith('master/')){
   if(!confirm('Confirmar a decisão sobre este acesso ao Mapa de Salas?'))return;
   const r=await api(action,{id});await render();
   if(r.codigo)codeBox('Convite do Apoio',r.codigo,'Válido por 24 horas. Entregue ao solicitante após conferir sua identidade.');
 }
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-action]');if(!b)return;
 b.disabled=true;
 try{await act(b.dataset.action,b.dataset.id||'');}catch(err){say(err.message);}finally{b.disabled=false;}
});
document.addEventListener('change',async e=>{if(e.target.id==='date'&&e.target.value){date=e.target.value;await render();}});
$('#sair').onclick=async()=>{try{if(!desk())await api('sair',{});pin='';staff=null;catalog=[];board={};leases=[];await entry();}catch(err){say(err.message);}};
let pinTimeout;
function resetTimer(){clearTimeout(pinTimeout);if(desk()&&pin)pinTimeout=setTimeout(()=>{pin='';board={};say('Sessão encerrada por inatividade.');render();},120000);}
document.addEventListener('pointerup',resetTimer);document.addEventListener('keydown',resetTimer);
window.addEventListener('hashchange',entry);
entry();
