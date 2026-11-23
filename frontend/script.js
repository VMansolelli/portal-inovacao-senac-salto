(() => {
'use strict';
const $ = (s,root=document)=>root.querySelector(s);
const esc = v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = v=>v.split('-').reverse().join('/');
const empty = text=>'<p class="empty-state empty-state-full">'+text+'</p>';
const btn = (label,action,id='')=>`<button type="button" class="btn btn-orange btn-sm" data-do="${action}" data-id="${esc(id)}">${label}</button>`;
const field = (key,label,type='text',required=true)=>`<div><label for="f-${key}">${label}${required?' *':''}</label>${type==='textarea'?`<textarea id="f-${key}" name="${key}" maxlength="5000" required></textarea>`:`<input id="f-${key}" name="${key}" type="${type}" ${type==='file'?'accept="image/jpeg,image/png,image/gif,image/webp"':'maxlength="254"'} ${required?'required':''}>`}</div>`;
const photoVersions=new Map();
function photoURL(row){
  const version=photoVersions.get(row.id);
  return version && row.foto ? row.foto+'?v='+version : row.foto;
}
const picture = row => row.foto?`<img src="${esc(photoURL(row))}" alt="" loading="lazy" style="width:100%;max-height:240px;object-fit:cover;border-radius:12px">`:'';
const workshopDetails = w=>`${esc(w.docente)} · ${esc(w.area)}<br>${date(w.data)} · ${esc(w.inicio)}–${esc(w.termino)} · ${esc(w.local)}<br>${w.vagas-w.inscritos} de ${w.vagas} vagas disponíveis`;
async function api(path,body) {
  const response=await fetch('/api/'+path, body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
  const result=await response.json();
  if(!response.ok) throw Object.assign(new Error(result.erro||'Falha ao carregar.'),{status:response.status});
  return result;
}
document.body.insertAdjacentHTML('beforeend',`<div class="toast" id="feedback" role="status"></div>
<dialog id="restritoDialog" aria-label="Área restrita"><div class="restrito-page"><div class="restrito-top"><strong>Área restrita</strong><div class="account-actions"><button class="back" id="back">Voltar ao portal</button><button type="button" id="reserve" class="back" hidden>Chave de reserva</button><button type="button" id="logout" hidden>Sair da conta</button></div></div><div class="restrito-body" id="painel"></div></div></dialog>
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
originalWorkshop.querySelector('[type=submit]').insertAdjacentHTML('beforebegin',field('imagem','Imagem da oficina (opcional)','file',false));
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
    catch(e){const inline=form.closest('.inline-editor');if(inline)$('[role=alert]',inline).textContent=e.message;else if(dialog.open)$('#popupErro').textContent=e.message;else notify(e.message);}
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
function editor(title,html,button){
  if(!button){
    open(title,html);
    return {form:$('form',dialog),close:()=>dialog.close()};
  }
  let region=document.getElementById(button.id+'-form');
  if(region && !region.hidden){region.hidden=true;button.setAttribute('aria-expanded','false');return;}
  if(region){
    region.hidden=false;button.setAttribute('aria-expanded','true');return;
  }
  region=document.createElement('section');
  region.id=button.id+'-form';region.className='inline-editor';
  region.innerHTML=`<div class="inline-heading"><h3>${title}</h3><button type="button" class="choice">Fechar formulário</button></div>${html}<p role="alert"></p>`;
  button.parentElement.after(region);
  button.setAttribute('aria-controls',region.id);button.setAttribute('aria-expanded','true');
  const form=$('form',region);
  form.removeAttribute('id');
  for(const input of form.querySelectorAll('[id]')){
    const label=form.querySelector('label[for="'+input.id+'"]');
    input.id=region.id+'-'+input.id;if(label)label.htmlFor=input.id;
  }
  const close=()=>{region.remove();button.setAttribute('aria-expanded','false');button.focus({preventScroll:true});};
  $('.inline-heading button',region).onclick=()=>{region.hidden=true;button.setAttribute('aria-expanded','false');button.focus({preventScroll:true});};
  return {form,close};
}
function news(row){
  const controls=field('titulo','Título da notícia')+'<div class="two-col">'+field('turma','Turma (opcional)','text',false)+field('curso','Curso (opcional)','text',false)+'</div>'+field('autor','Nome de quem publica (opcional)','text',false)+field('descricao','Descrição da notícia','textarea')+
    '<div><label for="categoriaNoticia">Categoria *</label><select required name="categoria" id="categoriaNoticia"><option value="">Selecione uma categoria</option>'+['Projeto de turma','Evento','Oficina','Inovação','Outro'].map(x=>'<option>'+x+'</option>').join('')+'</select></div>'+field('imagem',row?'Trocar foto (opcional)':'Foto da notícia','file',!row);
  const box=editor(row?'Editar notícia':'Publicar uma notícia',
    (row?'':'<p>Compartilhe uma notícia do Senac Salto, como uma conquista, uma exposição ou um convite à comunidade. O comitê avalia a notícia antes de publicá-la.</p>')+
    '<form class="form-grid">'+controls+'<button type="submit" class="btn btn-orange">'+(row?'Salvar alterações':'Enviar para aprovação')+'</button></form>',row?null:$('#openNoticiaModal'));
  if(!box)return;
  if(row){
    const category=box.form.elements.categoria;
    if(![...category.options].some(o=>o.value===row.categoria))category.add(new Option(row.categoria,row.categoria));
    for(const input of box.form.elements)if(input.name && input.type!=='file')input.value=row[input.name]||'';
  }
  wireSubmit(box.form,async data=>{
    if(data.imagem?.size)data.imagem=await jpeg(data.imagem);else delete data.imagem;
    await api(row?'admin/editar-noticia':'noticia',row?{...data,id:row.id}:data);
    box.close();notify(row?'Notícia atualizada.':'Notícia enviada para aprovação.');
    if(row)await refreshBoth();
  });
}
async function workshop(row){
  const button=$('#openOficinaForm');
  const box=editor(row?'Editar oficina':'Nova oficina',wkForm,row?null:button);
  if(!box)return;
  const form=box.form, local=form.elements.local, vagas=form.elements.vagas;
  local.replaceChildren(new Option('Carregando salas…',''));local.disabled=true;
  const submit=$('[type=submit]',form);submit.disabled=true;
  let salas;
  try{salas=new Map(await api('salas'));}
  catch{local.replaceChildren(new Option('Salas indisponíveis',''));const retry=document.createElement('button');
    retry.type='button';retry.textContent='Tentar carregar as salas novamente';
    retry.onclick=()=>{box.close();workshop(row);};form.append(retry);return;}
  local.disabled=false;submit.disabled=false;
  local.replaceChildren(new Option('Selecione o local',''));
  for(const [nome,capacidade] of salas)local.add(new Option(nome+' · '+capacidade+' pessoas',nome));
  if(row && !salas.has(row.local))local.add(new Option(row.local+' (cadastro anterior)',row.local));
  for(const input of form.elements) if(input.name && row && input.type!=='file')input.value=row[input.name]??'';
  function capacity(prefill){
    const max=salas.get(local.value);
    vagas.max=max||10000;
    if(prefill && max)vagas.value=max;
  }
  capacity(false);local.onchange=()=>capacity(true);
  $('[type=submit]',form).textContent=row?'Salvar alterações':'Enviar para aprovação';
  wireSubmit(form,async data=>{
    if(data.termino<=data.inicio)throw Error('O término deve ser depois do início.');
    if(data.imagem?.size)data.imagem=await jpeg(data.imagem);else delete data.imagem;
    await api(row?'admin/editar':'oficina',row?{...data,id:row.id}:data);
    box.close();notify(row?'Oficina atualizada.':'Oficina enviada para aprovação.');
    if(row)await refreshBoth();
  });
}
async function refreshPublic(){
  publicRows=await api('publico');
  const cards=(kind,render,none)=>publicRows.filter(r=>r.kind===kind).map(render).join('')||empty(none);
  $('#muralGrid').innerHTML=cards('noticia',r=>`<article class="ncard">${picture(r)}<div class="ncard-body"><span class="tag">${esc(r.categoria)}</span><h4>${esc(r.titulo)}</h4><p>${esc(r.descricao)}</p><div class="meta">${[r.turma,r.curso,r.autor].filter(Boolean).map(esc).join(' · ')}</div></div></article>`,'Nenhuma notícia publicada. Envie a primeira notícia da unidade!');
  $('#acoesGrid').innerHTML=cards('acao',r=>`<article class="mcard acao-card">${picture(r)}<h4>${esc(r.titulo)}</h4><p>${esc(r.descricao)}</p></article>`,'Nenhuma ação local publicada.');
  $('#saberesLista').innerHTML=cards('oficina',w=>`<article class="oficina-card"><div class="oficina-info">${picture(w)}<h4>${esc(w.titulo)}</h4><div class="oficina-meta"><span>${workshopDetails(w)}</span></div></div>${w.inscritos<w.vagas?btn('Inscrever-se','inscrever',w.id):'<span class="vagas-badge">Vagas esgotadas</span>'}</article>`,'Nenhuma oficina aprovada no momento.');
}
let master=false, requests=[];
const tabs={noticia:'Notícias',acao:'Ações locais',oficina:'Oficinas',email:'E-mails',inscritos:'Inscritos e PDF',ideia:'Ideias'};
function adminCard(r){
  let content='',actions='';
  if(r.kind==='oficina'){
    content=workshopDetails(r);actions=btn('Editar','editar',r.id)+btn('Excluir oficina','excluir-oficina',r.id);
  }else if(r.kind==='ideia'){
    content=`${esc(r.nome||'Anônimo')} · ${esc(r.perfil)} · ${esc(r.categoria)}<p>${esc(r.texto)}</p>`;
  }else{
    content=`<p>${esc(r.descricao)}</p>`+(r.kind==='noticia'?[r.categoria,r.turma,r.curso,r.autor].filter(Boolean).map(esc).join(' · '):'');
  }
  if(r.kind==='noticia')actions=btn('Editar notícia','editar-noticia',r.id)+btn('Excluir notícia','excluir-noticia',r.id);
  if(r.kind==='ideia')actions=(r.status==='arquivada'?'':btn('Arquivar ideia','arquivar-ideia',r.id))+btn('Apagar ideia','apagar-ideia',r.id);
  if(r.kind==='noticia' && r.status==='aprovada')actions+=btn('Arquivar notícia','arquivar-noticia',r.id);
  if(r.kind==='acao') actions=btn('Editar ação','editar-acao',r.id)+btn('Apagar ação','apagar',r.id);
  if(r.status==='pendente' && ['oficina','noticia'].includes(r.kind)) actions+=btn('Aprovar','aprovada',r.id)+btn('Rejeitar e arquivar','arquivada',r.id);
  return `<article class="admin-row">${r.foto?`<a class="admin-photo" href="${esc(photoURL(r))}" target="_blank" rel="noopener" aria-label="Abrir foto de ${esc(r.titulo)}">${picture(r)}</a>`:''}<div class="record-copy"><b>${esc(r.titulo||'Ideia recebida')}</b><div>${content}</div></div><div class="admin-actions">${actions}</div></article>`;
}
function renderAdmin(){
  $('#reserve').hidden=false;$('#logout').hidden=false;
  let records=adminRows.filter(r=>r.kind===tab);
  let content='';
  const sections=master?{...tabs,acessos:'Autorizar administradores'}:tabs;
  if(!sections[tab])tab='noticia';
  if(tab==='acessos' && master){
    content=requests.map(r=>`<article class="admin-row"><div><b>${esc(r.nome)}</b><p>${esc(r.email)} · ${esc(r.estado)}</p></div><div class="admin-actions">${r.estado==='ativa'?'':btn(r.estado==='aguarda ativação'?'Gerar novo convite':'Aprovar','aprovar-acesso',r.id)}${['pendente','aguarda ativação'].includes(r.estado)?btn('Rejeitar','rejeitar-acesso',r.id):''}</div></article>`).join('');
  }else if(tab==='ideia'){
    for(const [status,title] of [['pendente','Recebidas'],['arquivada','Arquivadas']]){
      const group=records.filter(r=>r.status===status);
      content+=`<h3 class="admin-heading">${title} <span>${group.length}</span></h3>`+(group.map(adminCard).join('')||'<p>Nenhuma ideia.</p>');
    }
  }else if(['email','inscritos'].includes(tab)){
    records=adminRows.filter(r=>r.kind==='oficina' && (tab==='email'||r.status==='aprovada'||r.inscritos));
    content=records.map(w=>`<article class="admin-row"><div><b>${esc(w.titulo)}</b><p>${tab==='email'?esc(w.docente)+' · '+esc(w.email)+' · '+esc(w.status):w.inscritos+' inscrito(s) de '+w.vagas+' vagas'}</p></div>${tab==='email'?btn('Preparar e-mail','mensagem',w.id):btn('Ver inscritos e baixar PDF','lista',w.id)}</article>`).join('');
  }else if(['noticia','oficina'].includes(tab)){
    for(const [status,title] of [['pendente','Aguardando aprovação'],['aprovada','Publicadas'],['arquivada','Arquivadas']]){
      const group=records.filter(r=>r.status===status);
      content+=`<h3 class="admin-heading">${title} <span>${group.length}</span></h3>`+(group.map(adminCard).join('')||'<p>Nenhum registro.</p>');
    }
  }else content=records.map(adminCard).join('');
  panel.innerHTML=`<div class="management"><nav class="admin-tabs" aria-label="Seções do painel"><a class="admin-tab" href="/totem-editor.html">Totem</a>${Object.entries(sections).map(([k,v])=>`<button type="button" class="admin-tab ${tab===k?'active':''}" aria-current="${tab===k?'page':'false'}" data-tab="${k}">${v}</button>`).join('')}</nav><section class="management-main"><h2>${sections[tab]}</h2>${tab==='acao'?btn('Adicionar ação local','nova'):''}${content||'<p>Nenhum registro recebido.</p>'}</section></div>`;
}
async function refreshBoth(){await Promise.all([refreshPublic(),loadAdmin()]);}
async function loadAdmin(){
  try{
    const [rows,profile]=await Promise.all([api('admin/lista'),api('admin/perfil')]);
    adminRows=rows;master=profile.master===true;
    requests=master && tab==='acessos'?await api('master/lista'):[];
    renderAdmin();
  }
  catch(e){
    adminRows=[];
    $('#reserve').hidden=true;$('#logout').hidden=true;master=false;requests=[];
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
        <button type="button" class="reset-link" id="request-access">Solicitar acesso administrativo</button>
        <button type="button" class="reset-link" id="activate-access">Ativar meu convite</button>
      </form>
    </div>`;
    const art=$('.brand-mark').cloneNode(true);
    art.removeAttribute('class');
    $('.login-art',panel).append(art);
    const form=$('form',panel);
    $('#request-access').onclick=()=>formPopup('Solicitar acesso','Seu pedido será avaliado por Victor.',field('nome','Nome')+field('email','E-mail institucional','email'),'Enviar solicitação',async d=>{
      await api('solicitar',d);dialog.close();$('.login-intro',panel).textContent='Solicitação registrada. Aguarde o contato de Victor.';
    });
    $('#activate-access').onclick=()=>credentialForm(true);
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
function credentialForm(activation){
  const endpoint=activation?'ativar':'usar-reserva';
  const help=activation?'Use o convite entregue por Victor. Se já tiver uma conta, informe sua senha atual.':'Use a chave de reserva gerada anteriormente no painel.';
  formPopup(activation?'Ativar conta':'Recuperar com chave',help,field('email','E-mail institucional','email')+field('codigo',activation?'Convite':'Chave de reserva')+
    '<label>Senha<input name="senha" type="password" autocomplete="new-password" minlength="8" required></label><label>Confirme a senha<input name="confirmacao" type="password" autocomplete="new-password" required></label>',
    activation?'Ativar conta':'Alterar senha',async d=>{
      if(d.senha!==d.confirmacao)throw Error('As senhas devem coincidir.');
      await api(endpoint,{email:d.email,codigo:d.codigo,senha:d.senha});dialog.close();await loadAdmin();
      const intro=$('.login-intro',panel);if(intro)intro.textContent='Tudo certo. Entre com seu e-mail e senha.';
    });
}
function recoveryForm(email){
  const form=$('.login-form',panel);
  form.innerHTML=`<h2 id="login-title">Recuperar senha</h2>
    <p class="login-intro">Informe seu e-mail para receber um link de redefinição.</p>
    <label for="recover-email">E-mail institucional</label>
    <input id="recover-email" type="email" name="email" autocomplete="username" required>
    <p role="status" class="login-intro"></p><p role="alert" class="login-error"></p>
    <button type="submit" class="login-submit">Enviar link</button>
    <button type="button" class="reset-link" id="by-key">Usar chave de reserva</button><button type="button" class="reset-link" id="to-login">Voltar ao login</button>`;
  form.elements.email.value=email;form.elements.email.focus();
  $('#by-key').onclick=()=>credentialForm(false);
  $('#to-login').onclick=loadAdmin;
  wireSubmit(form,async data=>{
    const error=$('[role=alert]',form),status=$('[role=status]',form);
    error.textContent='';status.textContent='';
    try{
      await api('recuperar',{email:data.email});
      status.textContent='Se o endereço estiver habilitado para receber mensagens, verifique a caixa de entrada e o spam. Abra o link “Reset password”.';
    }catch(e){error.textContent=e.status===404?'Recuperação indisponível. Peça ao responsável para verificar a versão da API no Render.':e.message;}
  });
}
function handleRecoveryLink(){
  const params=new URLSearchParams(location.hash.slice(1));
  if(params.get('type')!=='recovery' && !params.has('error_code') && !params.has('error'))return false;
  const token=params.get('access_token');
  history.replaceState(null,'',location.pathname+location.search);
  if(!token || params.get('type')!=='recovery'){
    open('Link indisponível','<p>Solicite um novo link na Área Restrita, em Esqueci minha senha.</p>');return true;
  }
  formPopup('Cadastre uma nova senha','Use pelo menos 8 caracteres.',
    '<label>Nova senha<input name="senha" type="password" autocomplete="new-password" minlength="8" required></label><label>Confirme a senha<input name="confirma" type="password" autocomplete="new-password" required></label>',
    'Salvar nova senha',async data=>{
      if(data.senha!==data.confirma)throw Error('As duas senhas precisam ser iguais.');
      await api('redefinir',{token,senha:data.senha});
      dialog.close();await adminOpen();const intro=$('.login-intro',panel);
      if(intro)intro.textContent='Senha alterada. Entre com a nova senha.';
    });
  dialog.addEventListener('close',()=>$('#popupBody').replaceChildren(),{once:true});
  return true;
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
  if(op==='aprovar-acesso' || op==='rejeitar-acesso'){
    const r=requests.find(item=>item.id===id);if(!master||!r)return;
    const approve=op==='aprovar-acesso';
    if(!confirm((approve?'Autorizar ':'Rejeitar ')+r.email+'?'))return;
    const reply=await api(approve?'master/aprovar':'master/rejeitar',{id});
    if(approve)showCode('Convite de ativação','Entregue este convite apenas à pessoa identificada em '+r.email+'. É válido por 24 horas.',reply.codigo);
    await loadAdmin();return;
  }
  if(op==='editar-acao'){
    const preview='<figure style="margin:0"><img alt="Foto da ação" style="width:100%;max-height:190px;object-fit:contain" hidden><figcaption></figcaption></figure>';
    formPopup('Editar ação','Selecione uma imagem para conferir a prévia e depois salve as alterações.',
      field('titulo','Título')+field('descricao','Texto','textarea')+preview+field('imagem','Nova foto','file',false),
      'Salvar alterações',async (data,form)=>{
        const file=form.elements.imagem.files[0];
        const payload={id,titulo:data.titulo,descricao:data.descricao};
        if(file)payload.imagem=await jpeg(file);
        await api('admin/editar-acao',payload);
        let message='Ação atualizada.';
        if(file){
          photoVersions.set(id,Date.now());
          try{
            const url=photoURL({id,foto:'/api/foto/'+encodeURIComponent(id)});
            const saved=await fetch(url,{cache:'no-store'});
            if(!saved.ok)throw Error();
            const bytes=new Uint8Array(await saved.arrayBuffer());
            const expected=atob(payload.imagem.split(',')[1]);
            message=bytes.length===expected.length && bytes.every((v,i)=>v===expected.charCodeAt(i))
              ? 'Foto atualizada e conferida.'
              : 'A imagem retornada pelo servidor é diferente da foto enviada.';
          }catch{message='Alterações enviadas. Não foi possível conferir a foto no servidor.';}
        }
        dialog.close();await refreshBoth();
        if(admin.open){
          const feedback=document.createElement('p');feedback.setAttribute('role','status');
          feedback.textContent=message;$('.management-main',panel)?.prepend(feedback);
        }else notify(message);
      });
    const f=$('form',dialog);f.elements.titulo.value=w.titulo;f.elements.descricao.value=w.descricao;
    const image=$('figure img',f),caption=$('figcaption',f);
    let objectURL='';
    function displayPhoto(){
      if(objectURL)URL.revokeObjectURL(objectURL);
      const file=f.elements.imagem.files[0];
      objectURL=file?URL.createObjectURL(file):'';
      const src=objectURL || photoURL(w);
      if(src)image.src=src;else image.removeAttribute('src');
      image.hidden=!src;
      caption.textContent=file?'Nova foto selecionada: '+file.name:(src?'Foto atual':'Ação sem foto.');
    }
    displayPhoto();f.elements.imagem.addEventListener('change',displayPhoto);
    dialog.addEventListener('close',()=>{if(objectURL)URL.revokeObjectURL(objectURL);},{once:true});
    return;
  }
  const confirmations={'excluir-oficina':'Excluir a oficina e todas as inscrições vinculadas?', 'apagar-ideia':'Apagar definitivamente esta ideia?', 'arquivar-ideia':'Mover a ideia para Arquivadas?', 'arquivar-noticia':'Retirar a notícia do mural e arquivar?'};
  if(Object.hasOwn(confirmations,op)){
    if(confirm(confirmations[op])){await api('admin/'+op,{id});await refreshBoth();}return;
  }
  if(op==='editar-noticia')return news(w);
  if(op==='excluir-noticia'){
    if(!confirm('Excluir definitivamente a notícia “'+w.titulo+'”?'))return;
    await api('admin/excluir-noticia',{id});await refreshBoth();return;
  }
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
  if(op==='inscrever'){
    button.id='inscricao-'+id;
    const controls=field('nome','Nome completo')+field('email','E-mail','email')+
      field('cargo','Cargo ou vínculo (opcional)','text',false)+field('area','Área ou curso (opcional)','text',false);
    const box=editor('Inscrever-se na oficina',`<p>${esc(w.titulo)} · ${date(w.data)} · ${esc(w.inicio)}</p>
      <form class="form-grid">${controls}<button type="submit" class="btn btn-orange">Confirmar inscrição</button></form>`,button);
    if(!box)return;
    wireSubmit(box.form,async data=>{
      await api('inscrever',{...data,workshop:id});
      box.close();notify('Inscrição confirmada!');
      try{await refreshPublic();}catch{notify('Inscrição confirmada. Atualize a página para consultar as vagas.');}
    });
    return;
  }
  if(op==='apagar'){
    if(!confirm('Apagar a ação “'+w.titulo+'” do portal?'))return;
    await api('admin/apagar',{id});
  }else await api('admin/moderar',{id,status:op});
  await refreshBoth();
}
function showCode(title,hint,code){
  open(title,`<p>${esc(hint)}</p><label>Código<input type="text" readonly value="${esc(code)}"></label>`);
  dialog.addEventListener('close',()=>$('#popupBody').replaceChildren(),{once:true});
}
document.addEventListener('click',async e=>{
  if(e.target.closest('#reserve')){
    if(!confirm('Gerar uma chave de reserva pessoal? Uma chave anterior deixará de funcionar.'))return;
    try{const r=await api('admin/reserva',{});showCode('Sua chave de reserva','Guarde em seu gerenciador de senhas. A chave funciona uma única vez.',r.codigo);}catch(err){alert(err.message);}return;
  }
  if(e.target.closest('#logout')){
    try{await api('sair',{});adminRows=[];await loadAdmin();}catch(err){alert(err.message);}
    return;
  }
  const b=e.target.closest('[data-do],[data-tab]');if(!b)return;
  if(b.dataset.tab){tab=b.dataset.tab;if(tab==='acessos')await loadAdmin();else renderAdmin();return;}
  b.disabled=true;
  try{await action(b);}catch(err){if(admin.open)alert(err.message);else notify(err.message);}finally{b.disabled=false;}
});
$('#back').onclick=()=>admin.close();
admin.onclose=()=>{$('#reserve').hidden=true;$('#logout').hidden=true;master=false;requests=[];adminRows=[];panel.replaceChildren();};
$('#closePopup').onclick=()=>dialog.close();
$('#openNoticiaModal').onclick=()=>news();
$('#openOficinaForm').onclick=()=>workshop();
$('#navRestrito').onclick=adminOpen;
const burger=$('#burgerBtn'), nav=$('#navLinks');
nav.before(burger);
burger.setAttribute('aria-controls',nav.id);
function mobileMenu(open){
  nav.classList.toggle('open',open);
  burger.setAttribute('aria-expanded',String(open));
  burger.setAttribute('aria-label',open?'Fechar menu':'Abrir menu');
}
mobileMenu(false);
burger.onclick=()=>mobileMenu(!nav.classList.contains('open'));
nav.addEventListener('click',()=>mobileMenu(false));
document.addEventListener('keydown',event=>{
  if(event.key==='Escape' && nav.classList.contains('open')){mobileMenu(false);burger.focus();}
});
document.addEventListener('click',event=>{
  if(nav.classList.contains('open') && !event.target.closest('.nav-inner'))mobileMenu(false);
});
matchMedia('(max-width:960px)').addEventListener('change',()=>mobileMenu(false));
const group=$('#ideiaPerfil');
group.onclick=e=>{const b=e.target.closest('[data-val]');if(b){$('.active',group)?.classList.remove('active');b.classList.add('active');group.dataset.value=b.dataset.val;}};
wireSubmit($('#formIdeia'),async (_,form)=>{
  await api('ideia',{nome:$('#ideiaNome').value,perfil:group.dataset.value,categoria:$('#ideiaCategoria').value,texto:$('#ideiaTexto').value});
  form.reset();$('[data-val]',group).click();notify('Ideia enviada ao comitê!');
});
refreshPublic().catch(()=>{for(const id of ['muralGrid','acoesGrid','saberesLista'])$('#'+id).innerHTML=empty('Não foi possível carregar. Atualize a página para tentar novamente.');});
if(!handleRecoveryLink() && new URLSearchParams(location.search).has('painel'))adminOpen();
})();

// Os acessos ficam abertos ao entrar no rodapé pelo celular.
const rodapeMobile = window.matchMedia('(max-width: 700px)');
function ajustarRodape() {
  document.querySelectorAll('.rodape-grupo details').forEach(grupo => {
    grupo.open = !rodapeMobile.matches || grupo.querySelector('summary').textContent === 'Acessos';
  });
}
ajustarRodape();
rodapeMobile.addEventListener('change', ajustarRodape);
