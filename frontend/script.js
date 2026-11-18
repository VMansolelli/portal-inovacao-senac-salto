(() => {
'use strict';
const $ = (s,root=document)=>root.querySelector(s);
const esc = v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = v=>v.split('-').reverse().join('/');
const empty = text=>'<p class="empty-state empty-state-full">'+text+'</p>';
const btn = (label,action,id='')=>`<button type="button" class="btn btn-orange btn-sm" data-do="${action}" data-id="${esc(id)}">${label}</button>`;
const field = (key,label,type='text',required=true)=>`<div><label for="f-${key}">${label}${required?' *':''}</label>${type==='textarea'?`<textarea id="f-${key}" name="${key}" maxlength="5000" required></textarea>`:`<input id="f-${key}" name="${key}" type="${type}" ${type==='file'?'accept="image/jpeg,image/png,image/gif,image/webp"':'maxlength="254"'} ${required?'required':''}>`}</div>`;
const picture = row => row.foto?`<img src="${esc(row.foto)}" alt="" loading="lazy" style="width:100%;max-height:240px;object-fit:cover;border-radius:12px">`:'';
const workshopDetails = w=>`${esc(w.docente)} · ${esc(w.area)}<br>${date(w.data)} · ${esc(w.inicio)}–${esc(w.termino)} · ${esc(w.local)}<br>${w.vagas-w.inscritos} de ${w.vagas} vagas disponíveis`;
async function api(path,body) {
  const response=await fetch('/api/'+path, body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
  const result=await response.json();
  if(!response.ok) throw Object.assign(new Error(result.erro||'Falha ao carregar.'),{status:response.status});
  return result;
}
document.body.insertAdjacentHTML('beforeend',`<div class="toast" id="feedback" role="status"></div>
<dialog id="restritoDialog" aria-label="Área restrita"><div class="restrito-page"><div class="restrito-top"><strong>Área restrita</strong><div class="account-actions"><button class="back" id="back">Voltar ao portal</button><button type="button" id="logout" hidden>Sair da conta</button></div></div><div class="restrito-body" id="painel"></div></div></dialog>
<dialog class="modal" id="popup" aria-labelledby="popupTitle" style="margin:auto;border:0"><button class="modal-close" aria-label="Fechar" id="closePopup">×</button><h3 class="modal-title" id="popupTitle"></h3><div id="popupBody"></div><p role="alert" id="popupErro"></p></dialog>`);
const dialog=$('#popup'), admin=$('#restritoDialog'), panel=$('#painel');
const originalWorkshop=$('#formOficina');
originalWorkshop.remove();
const wkKeys={ofNome:'titulo',ofMinistrante:'docente',ofArea:'area',ofData:'data',ofInicio:'inicio',ofTermino:'termino',ofLocal:'local',ofVagas:'vagas'};
for(const [id,name] of Object.entries(wkKeys)){
  const el=$('#'+id,originalWorkshop); el.name=name; el.parentElement.querySelector('label').htmlFor=id;
}
const seats=$('#ofVagas',originalWorkshop);
seats.required=true; seats.max='10000'; seats.placeholder='Quantidade de pessoas'; seats.previousElementSibling.textContent='Quantidade de vagas *';
$('.form-title',originalWorkshop).remove();
$('.two-col',originalWorkshop).insertAdjacentHTML('afterend',field('email','E-mail do docente','email'));
originalWorkshop.className='form-grid';
const wkForm=originalWorkshop.outerHTML;
let timer, publicRows=[], adminRows=[], tab='noticia';
function notify(msg) {
  const toast=$('#feedback'); toast.textContent=msg;toast.classList.add('show');
  clearTimeout(timer);timer=setTimeout(()=>toast.classList.remove('show'),4500);
}
function open(title,html) {
  $('#popupTitle').textContent=title;$('#popupBody').innerHTML=html;$('#popupErro').textContent='';
  dialog.showModal();
}
function wireSubmit(form,callback) {
  form.onsubmit=async ev=>{
    ev.preventDefault();const submit=$('[type=submit]',form);
    if(submit.disabled)return;
    submit.disabled=true;
    try{await callback(Object.fromEntries(new FormData(form)),form);}
    catch(e){if(dialog.open)$('#popupErro').textContent=e.message;else notify(e.message);}
    finally{submit.disabled=false;}
  };
}
function formPopup(title,description,controls,submit,callback) {
  open(title,`<p class="modal-description">${description}</p><form class="form-grid">${controls}<button type="submit" class="btn btn-orange">${submit}</button></form>`);
  wireSubmit($('form',dialog),callback);
}
async function jpeg(file) {
  if(!file?.size || file.size>20*1024*1024) throw Error('Escolha uma foto de até 20 MB.');
  const url=URL.createObjectURL(file), img=new Image();
  try{
    img.src=url;await img.decode();
    const scale=Math.min(1,900/Math.max(img.width,img.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',0.70);
  }finally{URL.revokeObjectURL(url);}
}
function news(){
  formPopup('Publicar uma notícia','Conte o que sua turma realizou. O comitê avalia a notícia antes de publicá-la no mural.',
    field('titulo','Título da notícia')+'<div class="two-col">'+field('turma','Turma responsável')+field('curso','Curso')+'</div>'+field('autor','Nome de quem publica (opcional)','text',false)+field('descricao','O que foi realizado?','textarea')+
    '<div><label for="categoriaNoticia">Categoria *</label><select required name="categoria" id="categoriaNoticia"><option value="">Selecione uma categoria</option>'+['Projeto de turma','Evento','Oficina','Inovação','Outro'].map(x=>'<option>'+x+'</option>').join('')+'</select></div>'+field('imagem','Foto da ação','file'),'Enviar para aprovação',async data=>{
      data.imagem=await jpeg(data.imagem);await api('noticia',data);dialog.close();notify('Notícia enviada para aprovação.');
    });
}
function workshop(row){
  open(row?'Editar oficina':'Nova oficina',wkForm);
  const form=$('form',dialog);
  for(const input of form.elements) if(input.name && row)input.value=row[input.name];
  $('[type=submit]',form).textContent=row?'Salvar alterações':'Enviar para aprovação';
  wireSubmit(form,async data=>{
    if(data.termino<=data.inicio)throw Error('O término deve ser depois do início.');
    await api(row?'admin/editar':'oficina',row?{...data,id:row.id}:data);
    dialog.close();notify(row?'Oficina atualizada.':'Oficina enviada para aprovação.');
    if(row)await refreshBoth();
  });
}
async function refreshPublic(){
  publicRows=await api('publico');
  const cards=(kind,render,none)=>publicRows.filter(r=>r.kind===kind).map(render).join('')||empty(none);
  $('#muralGrid').innerHTML=cards('noticia',r=>`<article class="ncard">${picture(r)}<div class="ncard-body"><span class="tag">${esc(r.categoria)}</span><h4>${esc(r.titulo)}</h4><p>${esc(r.descricao)}</p><div class="meta">${[r.turma,r.curso,r.autor].filter(Boolean).map(esc).join(' · ')}</div></div></article>`,'Nenhuma notícia publicada. Envie a primeira notícia da sua turma!');
  $('#acoesGrid').innerHTML=cards('acao',r=>`<article class="mcard acao-card">${picture(r)}<h4>${esc(r.titulo)}</h4><p>${esc(r.descricao)}</p></article>`,'Nenhuma ação local publicada.');
  $('#saberesLista').innerHTML=cards('oficina',w=>`<article class="oficina-card"><div class="oficina-info"><h4>${esc(w.titulo)}</h4><div class="oficina-meta"><span>${workshopDetails(w)}</span></div></div>${w.inscritos<w.vagas?btn('Inscrever-se','inscrever',w.id):'<span class="vagas-badge">Vagas esgotadas</span>'}</article>`,'Nenhuma oficina aprovada no momento.');
}
const tabs={noticia:'Notícias',acao:'Ações locais',oficina:'Oficinas',email:'E-mails',inscritos:'Inscritos e PDF',ideia:'Ideias'};
function adminCard(r){
  let content='',actions='';
  if(r.kind==='oficina'){
    content=workshopDetails(r);actions=btn('Editar','editar',r.id);
  }else if(r.kind==='ideia'){
    content=`${esc(r.nome||'Anônimo')} · ${esc(r.perfil)} · ${esc(r.categoria)}<p>${esc(r.texto)}</p>`;
  }else{
    content=`<p>${esc(r.descricao)}</p>`+(r.kind==='noticia'?[r.categoria,r.turma,r.curso,r.autor].filter(Boolean).map(esc).join(' · '):'');
  }
  if(r.kind==='acao') actions=btn('Apagar ação','apagar',r.id);
  if(r.status==='pendente' && ['oficina','noticia'].includes(r.kind)) actions+=btn('Aprovar','aprovada',r.id)+btn('Rejeitar e arquivar','arquivada',r.id);
  return `<article class="admin-row">${r.foto?`<a class="admin-photo" href="${esc(r.foto)}" target="_blank" rel="noopener" aria-label="Abrir foto de ${esc(r.titulo)}">${picture(r)}</a>`:''}<div class="record-copy"><b>${esc(r.titulo||'Ideia recebida')}</b><div>${content}</div></div><div class="admin-actions">${actions}</div></article>`;
}
function renderAdmin(){
  $('#logout').hidden=false;
  let records=adminRows.filter(r=>r.kind===tab);
  let content='';
  if(['email','inscritos'].includes(tab)){
    records=adminRows.filter(r=>r.kind==='oficina' && (tab==='email'||r.status==='aprovada'||r.inscritos));
    content=records.map(w=>`<article class="admin-row"><div><b>${esc(w.titulo)}</b><p>${tab==='email'?esc(w.docente)+' · '+esc(w.email)+' · '+esc(w.status):w.inscritos+' inscrito(s) de '+w.vagas+' vagas'}</p></div>${tab==='email'?btn('Preparar e-mail','mensagem',w.id):btn('Ver inscritos e baixar PDF','lista',w.id)}</article>`).join('');
  }else if(['noticia','oficina'].includes(tab)){
    for(const [status,title] of [['pendente','Aguardando aprovação'],['aprovada','Publicadas'],['arquivada','Arquivadas']]){
      const group=records.filter(r=>r.status===status);
      content+=`<h3 class="admin-heading">${title} <span>${group.length}</span></h3>`+(group.map(adminCard).join('')||'<p>Nenhum registro.</p>');
    }
  }else content=records.map(adminCard).join('');
  panel.innerHTML=`<div class="management"><nav class="admin-tabs" aria-label="Seções do painel">${Object.entries(tabs).map(([k,v])=>`<button type="button" class="admin-tab ${tab===k?'active':''}" aria-current="${tab===k?'page':'false'}" data-tab="${k}">${v}</button>`).join('')}</nav><section class="management-main"><h2>${tabs[tab]}</h2>${tab==='acao'?btn('Adicionar ação local','nova'):''}${content||'<p>Nenhum registro recebido.</p>'}</section></div>`;
}
async function refreshBoth(){await Promise.all([refreshPublic(),loadAdmin()]);}
async function loadAdmin(){
  try{adminRows=await api('admin/lista');renderAdmin();}
  catch(e){
    adminRows=[];
    $('#logout').hidden=true;
    if(e.status!==403){panel.innerHTML='<p role="alert">'+esc(e.message)+'</p>';return;}
    panel.innerHTML=`<div class="login-layout">
      <div class="login-brand">
        <span class="login-campus">Senac Salto</span>
        <div class="login-wordmark">Portal de <br>Inovação<span>.</span></div>
        <div class="login-art" aria-hidden="true"></div>
      </div>
      <form class="login-form" aria-labelledby="login-title">
        <h2 id="login-title">Acesso administrativo</h2>
        <p class="login-intro">Entre com sua conta institucional para gerenciar o portal.</p>
        <label for="login-email">E-mail institucional</label>
        <input id="login-email" type="email" name="email" autocomplete="username" placeholder="nome@sp.senac.br" required>
        <label for="login-password">Senha</label>
        <div class="login-password">
          <input id="login-password" type="password" name="senha" autocomplete="current-password" required>
          <button type="button" class="login-toggle" aria-controls="login-password" aria-label="Mostrar senha">Mostrar</button>
        </div>
        <p class="login-error" role="alert"></p>
        <button type="submit" class="login-submit">Entrar no painel <span aria-hidden="true">→</span></button>
        <button type="button" class="reset-link" id="forgot">Esqueci minha senha</button>
      </form>
    </div>`;
    const art=$('.brand-mark').cloneNode(true);
    art.removeAttribute('class');
    $('.login-art',panel).append(art);
    const form=$('form',panel);
    $('#forgot').onclick=()=>recoveryForm(form.elements.email.value);
    const toggle=$('.login-toggle',form);
    toggle.onclick=()=>{
      const input=form.elements.senha;
      const show=input.type==='password';
      input.type=show?'text':'password';
      toggle.textContent=show?'Ocultar':'Mostrar';
      toggle.setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha');
    };
    wireSubmit(form,async data=>{
      const submit=$('[type=submit]',form);
      const error=$('[role=alert]',form);
      error.textContent='';
      submit.textContent='Entrando…';
      try{await api('entrar',data);form.reset();await loadAdmin();}
      catch(err){error.textContent=err.message;submit.innerHTML='Entrar no painel <span aria-hidden="true">→</span>';}
    });
  }
}
function recoveryForm(email, confirmCode=false){
  const form=$('.login-form',panel);
  form.innerHTML=`<h2 id="login-title">${confirmCode?'Cadastre uma nova senha':'Recuperar senha'}</h2>
    <p class="login-intro">${confirmCode?'Se a conta existir, você receberá um código por e-mail.':'Informe o e-mail institucional usado no painel.'}</p>
    <label for="recover-email">E-mail institucional</label>
    <input id="recover-email" type="email" name="email" autocomplete="username" required>
    ${confirmCode?`<label for="recover-code">Código recebido</label><input id="recover-code" name="codigo" type="text" inputmode="numeric" pattern="[0-9]{6,10}" autocomplete="one-time-code" required>
    <label for="recover-password">Nova senha</label><input id="recover-password" type="password" name="senha" autocomplete="new-password" minlength="8" placeholder="Pelo menos 8 caracteres" required>
    <label for="recover-confirm">Confirme a nova senha</label><input id="recover-confirm" name="confirmacao" type="password" autocomplete="new-password" required>`:''}
    <p role="alert" class="login-error"></p>
    <button type="submit" class="login-submit">${confirmCode?'Salvar nova senha':'Enviar código'}</button>
    ${confirmCode?'<button type="button" class="reset-link" id="again">Solicitar outro código</button>':''}
    <button type="button" class="reset-link" id="to-login">Voltar ao login</button>`;
  form.elements.email.value=email;
  if(confirmCode){form.elements.email.readOnly=true;form.elements.codigo.focus();$('#again').onclick=()=>recoveryForm(email);}
  else form.elements.email.focus();
  $('#to-login').onclick=loadAdmin;
  wireSubmit(form,async data=>{
    const feedback=$('[role=alert]',form);
    try{
      feedback.textContent='';
      if(confirmCode){
        if(data.senha!==data.confirmacao)throw Error('As duas senhas precisam ser iguais.');
        await api('redefinir',{email:data.email,codigo:data.codigo,senha:data.senha});
        await loadAdmin();
        const intro=$('.login-intro',panel);
        if(intro)intro.textContent='Senha alterada. Entre com sua nova senha.';
      }else{
        await api('recuperar',{email:data.email});
        recoveryForm(data.email,true);
      }
    }catch(err){feedback.textContent=err.message;}
  });
}
async function adminOpen(){if(!admin.open)admin.showModal();panel.textContent='Carregando painel…';await loadAdmin();}
function message(w){
  const subject='Oficina '+w.titulo;
  const body=w.status==='aprovada'?`Olá, ${w.docente}! Sua oficina “${w.titulo}” foi aprovada para ${date(w.data)}, das ${w.inicio} às ${w.termino}, em ${w.local}.`:w.status==='arquivada'?`Olá, ${w.docente}! Agradecemos a proposta “${w.titulo}”. Nesta edição, ela foi arquivada.`:`Olá, ${w.docente}! Gostaríamos de conversar sobre a proposta “${w.titulo}”.`;
  formPopup('E-mail ao docente','Revise a mensagem. O envio será concluído no seu aplicativo de e-mail.',field('dest','Para','email')+field('assunto','Assunto')+field('mensagem','Mensagem','textarea'),'Abrir no aplicativo de e-mail',async d=>{
    location.href='mailto:'+encodeURIComponent(d.dest)+'?subject='+encodeURIComponent(d.assunto)+'&body='+encodeURIComponent(d.mensagem);
  });
  const f=$('form',dialog);f.elements.dest.value=w.email;f.elements.assunto.value=subject;f.elements.mensagem.value=body;
}
async function action(button){
  const op=button.dataset.do,id=button.dataset.id;
  const w=(op==='inscrever'?publicRows:adminRows).find(r=>r.id===id);
  if(op==='editar')return workshop(w);
  if(op==='mensagem')return message(w);
  if(op==='nova')return formPopup('Adicionar ação local','A ação será publicada em O que Fazemos.',field('titulo','Título')+field('descricao','Texto','textarea')+field('imagem','Foto','file'),'Publicar ação',async d=>{
    d.imagem=await jpeg(d.imagem);await api('admin/acao',d);dialog.close();await refreshBoth();
  });
  if(op==='lista'){
    const inscritos=await api('admin/inscritos/'+id);
    open('Inscritos · '+w.titulo,`<p>${inscritos.length} de ${w.vagas} vagas preenchidas</p>${inscritos.map(r=>`<p><b>${esc(r.nome)}</b><br>${[r.email,r.cargo,r.area].filter(Boolean).map(esc).join(' · ')}</p>`).join('')||'<p>Nenhuma inscrição.</p>'}<button id="download" class="btn btn-blue">Baixar relatório em PDF</button>`);
    $('#download').onclick=()=>window.baixarLista(w,inscritos);return;
  }
  if(op==='inscrever')return formPopup('Inscrever-se na oficina',esc(w.titulo)+' · '+date(w.data)+' · '+esc(w.inicio),field('nome','Nome completo')+field('email','E-mail','email')+field('cargo','Cargo ou vínculo (opcional)','text',false)+field('area','Área ou curso (opcional)','text',false),'Confirmar inscrição',async d=>{
    try{await api('inscrever',{...d,workshop:id});}catch(e){await refreshPublic();throw e;}
    dialog.close();notify('Inscrição confirmada!');await refreshPublic();
  });
  if(op==='apagar'){
    if(!confirm('Apagar a ação “'+w.titulo+'” do portal?'))return;
    await api('admin/apagar',{id});
  }else await api('admin/moderar',{id,status:op});
  await refreshBoth();
}
document.addEventListener('click',async e=>{
  if(e.target.closest('#logout')){
    try{await api('sair',{});adminRows=[];await loadAdmin();}catch(err){alert(err.message);}
    return;
  }
  const b=e.target.closest('[data-do],[data-tab]');if(!b)return;
  if(b.dataset.tab){tab=b.dataset.tab;renderAdmin();return;}
  b.disabled=true;
  try{await action(b);}catch(err){if(admin.open)alert(err.message);else notify(err.message);}finally{b.disabled=false;}
});
$('#back').onclick=()=>admin.close();
admin.onclose=()=>{$('#logout').hidden=true;adminRows=[];panel.replaceChildren();};
$('#closePopup').onclick=()=>dialog.close();
$('#openNoticiaModal').onclick=news;
$('#openOficinaForm').onclick=()=>workshop();
$('#navRestrito').onclick=adminOpen;
$('#burgerBtn').onclick=()=>$('#navLinks').classList.toggle('open');
$('#navLinks').addEventListener('click',()=>$('#navLinks').classList.remove('open'));
const group=$('#ideiaPerfil');
group.onclick=e=>{const b=e.target.closest('[data-val]');if(b){$('.active',group)?.classList.remove('active');b.classList.add('active');group.dataset.value=b.dataset.val;}};
wireSubmit($('#formIdeia'),async (_,form)=>{
  await api('ideia',{nome:$('#ideiaNome').value,perfil:group.dataset.value,categoria:$('#ideiaCategoria').value,texto:$('#ideiaTexto').value});
  form.reset();$('[data-val]',group).click();notify('Ideia enviada ao comitê!');
});
refreshPublic().catch(()=>{for(const id of ['muralGrid','acoesGrid','saberesLista'])$('#'+id).innerHTML=empty('Não foi possível carregar. Atualize a página para tentar novamente.');});
if(new URLSearchParams(location.search).has('painel'))adminOpen();
})();
