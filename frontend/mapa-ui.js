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
const tabs={excel:'Mapa do Excel',relatorio:'Relatório de chaves',acessos:'Permissões'};
let staff=null,activeTab='excel',date=nowDay(),generation=0,balcao;
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
 generation++;staff=null;date=nowDay();document.body.classList.toggle('desk',desk());
 $('h1').textContent=desk()?'Balcão de chaves':'Mapa de salas';
 $('#campus').textContent=desk()?'Senac Salto · Docentes':'Senac Salto · Apoio';
 $('.switch').textContent=desk()?'Área do Apoio':'Balcão docente';$('.switch').href=desk()?'#':'#chaves';say('');$('#page').textContent='Carregando…';$('#tabs').innerHTML='';$('#print').hidden=true;$('#sair').hidden=true;
 if(!desk())try{staff=await api('perfil');}catch(err){if(err.status!==403)say(err.message);}
 await render();
}
function gate(){
 $('#page').innerHTML='<div class="card"><h2>Acesso do Apoio</h2><form class="form">'+input('E-mail institucional','email','email')+input('Senha','senha','password','','required autocomplete="current-password"')+submit('Entrar')+'</form>'+btn('Solicitar acesso','solicitar')+btn('Ativar convite','ativar')+'<p role="alert" class="gate-error"></p></div>';
 formWire($('#page form'),async d=>{await api('entrar',d);staff=await api('perfil');say('');await render();},$('.gate-error'));
}
async function render(){
 const run=++generation,mode=desk();
 $('#sair').hidden=!mode&&!staff;
 if(!mode&&!staff){$('#print').hidden=true;$('#tabs').replaceChildren();gate();return;}
 $('#tabs').innerHTML=mode?'':Object.entries(tabs).filter(([k])=>k!=='acessos'||staff.master).map(([k,v])=>`<button data-action="tab" data-id="${k}" aria-current="${activeTab===k?'page':'false'}">${v}</button>`).join('');
 $('#print').hidden=true;
 try{
 if(mode){
   const data=await api('balcao',{});if(run!==generation)return;
   balcao=data;
   const detalhe=a=>[a.turma,['Manhã','Tarde','Noite'][a.turno],a.horario].filter(Boolean).join(' · ');
   const abertas=data.abertas.map(m=>row(m.aula.sala,br(m.dia)+' · '+detalhe(m.aula),btn('Devolver','entregar',m.id))).join('');
   const aulas=data.aulas.map(a=>row(a.sala,detalhe(a),a.ocupada?'Chave em uso':btn('Retirar','pegar',a.indice,'primary'))).join('');
   $('#page').innerHTML=tools('Balcão · '+br(data.dia),btn('Atualizar lista','retry'))+
     (abertas?'<h2>Devolver uma chave</h2>'+abertas:'')+'<h2>Retirar para uma aula</h2>'+ (aulas||'<p>Nenhuma aula publicada para hoje.</p>');
 }else if(activeTab==='excel'){abrirImportacao($('#page'),api);
 }else if(activeTab==='relatorio'){
   const lista=await api('relatorio',{data:date});if(run!==generation)return;
   $('#page').innerHTML=tools('Relatório de chaves',dateField()+btn('QR do balcão','qr'))+'<p>Retiradas e devoluções da data escolhida, incluindo todas as chaves ainda em uso.</p>'+
    (lista.map(m=>row(m.aula.sala+' · '+m.aula.turma,'Retirada: '+m.retirante+' · '+stamp(m.retirada)+(m.devolucao?' | Devolução: '+m.devolvente+' · '+stamp(m.devolucao):' | Aguardando devolução'), '')).join('')||'<p>Nenhum movimento.</p>');
 }else{
  const list=await api('master/lista');if(run!==generation)return;
  $('#page').innerHTML=tools('Permissões do Apoio','')+(list.map(x=>row(x.nome,x.email+' · '+x.estado,x.estado==='ativa'?'':btn('Aprovar / emitir convite','master/aprovar',x.id)+btn('Rejeitar','master/rejeitar',x.id))).join('')||'<p>Nenhuma solicitação. Apenas sua conta tem acesso inicialmente.</p>');
 }
 }catch(err){if(run===generation){if(err.status===403&&!mode){staff=null;say(err.message);return render();}$('#page').innerHTML=btn('Tentar novamente','retry');say(err.message);}}
}
const tools=(title,buttons)=>`<div class="tools no-print"><h2>${esc(title)}</h2>${buttons}</div>`;
const row=(title,sub,actions)=>`<article class="row"><div><strong>${esc(title)}</strong><p class="muted">${esc(sub)}</p></div><div class="buttons">${actions}</div></article>`;
const dateField=()=>`<label>Data<input id="date" type="date" value="${date}" required></label>`;
async function act(action,id){
 if(action==='retry')return render();
 if(action==='tab'){activeTab=id;return render();}
 if(action==='qr')return modal('QR Code permanente','<p>Fixe este código no balcão. Ele abre a consulta e a movimentação de chaves.</p><img class="qr" src="/mapa-qr.svg" alt="QR do balcão de chaves"><p><a href="/mapa-qr.svg" download="QR-balcao.svg">Baixar QR para impressão</a></p>');
 if(action==='pegar'||action==='entregar'){
   const pegar=action==='pegar';
   const aula=pegar?balcao.aulas.find(a=>a.indice===Number(id)):balcao.abertas.find(m=>m.id===id)?.aula;
   if(!aula)return render();
   const origem=pegar?{revisao:balcao.revisao,indice:Number(id),pedido:crypto.randomUUID()}:{id};
   return modal(pegar?'Retirar chave':'Devolver chave','<h3>'+esc(aula.sala)+'</h3><p>'+esc(aula.turma)+'</p>'+input('Seu nome completo','nome','text','','required maxlength="254" autocomplete="off"'),async d=>{
     await api(action,{...origem,nome:d.nome.trim()});await done((pegar?'Retirada':'Devolução')+' registrada · '+aula.sala);
   },pegar?'Confirmar retirada':'Confirmar devolução');
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
$('#sair').onclick=async()=>{try{await api('sair',{});activeTab='excel';await entry();}catch(err){say(err.message);}};
window.addEventListener('hashchange',()=>{if($('#modal').open)$('#modal').close();entry();});
entry();
