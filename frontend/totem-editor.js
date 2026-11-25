'use strict';
let estado,arquivo='',legenda='',enviando=false;
const ed=el('#edicao'),hor=el('#hora');
function mensagem(txt){el('#msg').textContent=txt;}
function tipo(){
 const destino=ed.elements.tipo.value;
 const grupos={'#linksCurso':destino==='Curso','#anexo':['Reel','Vídeo'].includes(destino),'#captions':destino==='Vídeo'};
 for(const [id,visivel] of Object.entries(grupos)){
   const grupo=el(id);grupo.hidden=!visivel;
   for(const input of grupo.querySelectorAll('input'))input.disabled=!visivel;
 }
}
function limpar(){ed.reset();ed.elements.id.value='';ed.elements.inicio.value=diaAtual();ed.elements.fim.value=diaAtual();legenda='';el('#vttAtual').textContent='';arquivo='';el('#existente').textContent='';tipo();}
ed.elements.tipo.onchange=tipo;
ed.onreset=()=>setTimeout(()=>{if(!ed.elements.titulo.value){ed.elements.id.value='';legenda='';el('#vttAtual').textContent='';arquivo='';ed.elements.inicio.value=diaAtual();ed.elements.fim.value=diaAtual();el('#existente').textContent='';tipo();}},0);
async function carregar(){
 estado=await pedido('admin/totem');el('#painel').hidden=false;
 hor.elements.noticia_segundos.value=estado.horarios.noticia_segundos??30;
 const arte=estado.horarios.arte_reserva;
 el('#prev-arte').hidden=!arte;if(arte)el('#prev-arte').src=arte;
 hor.elements.avaliacao.value=estado.horarios.avaliacao||'';
 const locais=estado.horarios.ambientes||[{nome:'Secretaria',horario:estado.horarios.secretaria},{nome:'Biblioteca',horario:estado.horarios.biblioteca}];
 el('#ambientes-editor').innerHTML=Array.from({length:4},(_,i)=>{
   const local=locais[i]||{};
   return '<fieldset><legend>Ambiente '+(i+1)+'</legend>'+[['nome','Nome'],['horario','Horário de funcionamento'],['telefone','Telefone (opcional)']].map(([campo,label])=>'<label>'+label+'<input type="'+(campo==='telefone'?'tel':'text')+'" name="'+campo+i+'" maxlength="254" value="'+h(local[campo]||'')+'"></label>').join('')+'</fieldset>';
 }).join('');
 el('#avisos').innerHTML=estado.avisos.map(a=>'<article><div><strong>'+h(a.titulo)+'</strong><p>'+(a.tipo==='Reel'?'Centro · Vídeo da unidade':h(a.tipo))+(a.tipo==='Reel'&&!a.arquivo?' · Anexe o vídeo para exibir':'')+' · '+dataBR(a.inicio)+' – '+dataBR(a.fim)+'</p></div><button data-edit="'+h(a.id)+'">Editar</button><button data-del="'+h(a.id)+'">Excluir</button></article>').join('');
 el('#itens').innerHTML=estado.itens.map(x=>'<article><div><strong>'+h(x.titulo)+'</strong><p>'+h(tipoNome[x.tipo])+' · '+(x.oculto?'Oculto':'Visível')+'</p></div><button data-vis="'+h(x.id)+'">'+(x.oculto?'Mostrar':'Ocultar')+'</button></article>').join('');
}
async function salvar(op,d){await pedido('admin/totem/'+op,d);await carregar();mensagem('Alteração salva.');}
hor.onsubmit=async e=>{e.preventDefault();const botao=hor.querySelector('button');if(botao.disabled)return;botao.disabled=true;
 try{const ambientes=[];
 for(let i=0;i<4;i++){
   const local=Object.fromEntries(['nome','horario','telefone'].map(k=>[k,hor.elements[k+i].value.trim()]));
   if(!local.nome&&!local.horario&&!local.telefone)continue;
   if(!local.nome||!local.horario)throw Error('Complete o nome e o horário do ambiente '+(i+1)+'.');
   ambientes.push(local);
 }
 const file=hor.elements.arte.files[0];let arte;
 if(file&&hor.elements.remover_arte.checked)throw Error('Escolha enviar ou remover a arte.');
 if(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8388608)throw Error('Use JPG, PNG ou WebP de até 8 MB.');
   const upload=await pedido('admin/totem/upload',{mime:file.type,bytes:file.size});
   const resp=await fetch(upload.url,{method:'PUT',headers:{'Content-Type':file.type},body:file});
   if(!resp.ok)throw Error('Não foi possível enviar a arte.');arte=upload.publica;
 }else if(hor.elements.remover_arte.checked)arte='';
 await salvar('horarios',{ambientes,arte_reserva:arte,avaliacao:hor.elements.avaliacao.value,noticia_segundos:hor.elements.noticia_segundos.valueAsNumber});hor.elements.arte.value='';hor.elements.remover_arte.checked=false;}catch(err){mensagem(err.message);}finally{botao.disabled=false;}};
ed.onsubmit=async e=>{
 e.preventDefault();if(enviando)return;enviando=true;const d=Object.fromEntries(new FormData(ed));const file=d.cartaz||d.video;delete d.video;delete d.cartaz;const vtt=d.vtt;delete d.vtt;
 for(const c of ed.elements)c.disabled=true;
 try{
  if(d.fim<d.inicio)throw Error('Confira as datas da divulgação.');
  const anterior=estado.avisos.find(a=>a.id===d.id);
  d.descricao=anterior?.descricao||'';
  if(d.tipo==='Curso'){
   d.imagem_curso=anterior?.imagem_curso||'';
   if(!file?.size&&!d.imagem_curso)throw Error('Anexe a imagem do curso.');
  }
  if(file?.size){
   mensagem('Enviando arquivo…');const upload=await pedido('admin/totem/upload',{mime:file.type,bytes:file.size});
   const r=await fetch(upload.url,{method:'PUT',headers:{'Content-Type':file.type},body:file});
   if(!r.ok)throw Error('Envio interrompido. Selecione o arquivo e tente novamente.');
   if(d.tipo==='Curso')d.imagem_curso=upload.publica;else arquivo=upload.arquivo;
  }
  if(d.tipo==='Vídeo'&&vtt.size){if(vtt.size>120000)throw Error('Legenda muito grande.');legenda=(await vtt.text()).replace(/^\uFEFF/,'');}
  await salvar('aviso',{...d,legenda,arquivo:['Vídeo','Reel'].includes(d.tipo)?arquivo:''});limpar();
 }catch(err){mensagem(err.message);}finally{enviando=false;for(const c of ed.elements)c.disabled=false;tipo();}
};
document.addEventListener('click',async e=>{
 const b=e.target.closest('button[data-edit],button[data-del],button[data-vis]');if(!b||enviando)return;b.disabled=true;
 try{if(b.dataset.edit){
  const a=estado.avisos.find(x=>x.id===b.dataset.edit);ed.reset();
  for(const k of ['id','tipo','titulo','inicio','fim'])ed.elements[k].value=a[k]||'';
  ed.elements.segundos.value=a.segundos||15;
  legenda=a.legenda||'';el('#vttAtual').textContent=legenda?'Legenda anexada.':'';arquivo=a.arquivo||'';el('#existente').textContent=arquivo?'Vídeo já anexado. Selecione outro para trocar.':'';tipo();ed.elements.titulo.focus();
 }else if(b.dataset.del){if(confirm('Excluir esta divulgação do totem?'))await salvar('excluir',{id:b.dataset.del});}
 else{const x=estado.itens.find(v=>v.id===b.dataset.vis);await salvar('visibilidade',{id:x.id,oculto:!x.oculto});}
 }catch(err){mensagem(err.message);}finally{b.disabled=false;}
});
async function listarFotos(){
 const lista=el('#lista-fotos');
 try{
   const fotos=await pedido('admin/totem/galeria');
   lista.innerHTML=['pendente','aprovada'].map(estado=>{
     const grupo=fotos.filter(f=>f.estado===estado);
     const botoes=estado==='pendente'?[['aprovar','Aprovar'],['rejeitar','Rejeitar']]:[['arquivar','Retirar de exibição']];
     return '<h3>'+(estado==='pendente'?'Aguardando aprovação':'Em exibição')+' ('+grupo.length+')</h3><div class="grade-fotos">'+grupo.map(f=>'<article><img loading="lazy" alt="Foto enviada para o totem" src="/api/admin/totem/galeria/'+h(f.id)+'">'+botoes.map(([acao,texto])=>'<button data-foto="'+h(f.id)+'" data-decisao="'+acao+'">'+texto+'</button>').join('')+'</article>').join('')+'</div>';
   }).join('');
 }catch(err){mensagem(err.message);}
}
el('#atualizar-fotos').onclick=listarFotos;
el('#lista-fotos').onclick=async e=>{
 const b=e.target.closest('button[data-decisao]');if(!b)return;
 if(b.dataset.decisao==='rejeitar'&&!confirm('Rejeitar e excluir esta foto?'))return;
 b.disabled=true;
 try{await pedido('admin/totem/galeria/decidir',{id:b.dataset.foto,decisao:b.dataset.decisao});mensagem('Decisão registrada.');}
 catch(err){mensagem(err.message);}
 finally{await listarFotos();b.disabled=false;}
};
function abrirSecao(){
 const ids=['config','divulgacoes','galeria','conteudo'];const atual=ids.includes(location.hash.slice(1))?location.hash.slice(1):'config';
 if(atual==='galeria')listarFotos();
 for(const id of ids){el('#'+id).hidden=id!==atual;el('.menu-editor a[href="#'+id+'"]').setAttribute('aria-current',id===atual?'page':'false');}
}
window.addEventListener('hashchange',abrirSecao);abrirSecao();
limpar();carregar().catch(e=>mensagem(e.message+' Acesse a Área restrita para entrar.'));

if(document.documentElement.classList.contains('integrado')&&window.frameElement){
 const main=document.querySelector('main');
 const ajustarAltura=()=>{window.frameElement.style.height=Math.ceil(main.getBoundingClientRect().height+3)+'px';};
 new ResizeObserver(ajustarAltura).observe(main);
 ajustarAltura();
}
