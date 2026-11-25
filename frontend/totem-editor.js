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
 hor.elements.avaliacao.value=estado.horarios.avaliacao||'';
 const locais=estado.horarios.ambientes||[{nome:'Secretaria',horario:estado.horarios.secretaria},{nome:'Biblioteca',horario:estado.horarios.biblioteca}];
 el('#ambientes-editor').innerHTML=Array.from({length:4},(_,i)=>{
   const local=locais[i]||{};
   return '<fieldset><legend>Ambiente '+(i+1)+'</legend>'+[['nome','Nome'],['horario','Horário de funcionamento'],['telefone','Telefone (opcional)']].map(([campo,label])=>'<label>'+label+'<input type="'+(campo==='telefone'?'tel':'text')+'" name="'+campo+i+'" maxlength="254" value="'+h(local[campo]||'')+'"></label>').join('')+'</fieldset>';
 }).join('');
 el('#avisos').innerHTML=estado.avisos.map(a=>'<article><div><strong>'+h(a.titulo)+'</strong><p>'+h(a.tipo)+(a.tipo==='Reel'&&!a.arquivo?' · Anexe o vídeo para exibir':'')+' · '+dataBR(a.inicio)+' – '+dataBR(a.fim)+'</p></div><button data-edit="'+h(a.id)+'">Editar</button><button data-del="'+h(a.id)+'">Excluir</button></article>').join('');
 el('#itens').innerHTML=estado.itens.map(x=>'<article><div><strong>'+h(x.titulo)+'</strong><p>'+h(tipoNome[x.tipo])+' · '+(x.oculto?'Oculto':'Visível')+'</p></div><button data-vis="'+h(x.id)+'">'+(x.oculto?'Mostrar':'Ocultar')+'</button></article>').join('');
}
async function salvar(op,d){await pedido('admin/totem/'+op,d);await carregar();mensagem('Alteração salva.');}
hor.onsubmit=async e=>{e.preventDefault();try{const ambientes=[];
 for(let i=0;i<4;i++){
   const local=Object.fromEntries(['nome','horario','telefone'].map(k=>[k,hor.elements[k+i].value.trim()]));
   if(!local.nome&&!local.horario&&!local.telefone)continue;
   if(!local.nome||!local.horario)throw Error('Complete o nome e o horário do ambiente '+(i+1)+'.');
   ambientes.push(local);
 }
 await salvar('horarios',{ambientes,avaliacao:hor.elements.avaliacao.value,noticia_segundos:hor.elements.noticia_segundos.valueAsNumber});}catch(err){mensagem(err.message);}};
ed.onsubmit=async e=>{
 e.preventDefault();if(enviando)return;enviando=true;const d=Object.fromEntries(new FormData(ed));const file=d.cartaz||d.video;delete d.video;delete d.cartaz;const vtt=d.vtt;delete d.vtt;
 for(const c of ed.elements)c.disabled=true;
 try{
  if(d.fim<d.inicio)throw Error('Confira as datas da divulgação.');
  if(file?.size){
   mensagem('Enviando arquivo…');const upload=await pedido('admin/totem/upload',{mime:file.type,bytes:file.size});
   const r=await fetch(upload.url,{method:'PUT',headers:{'Content-Type':file.type},body:file});
   if(!r.ok)throw Error('Envio interrompido. Selecione o arquivo e tente novamente.');
   if(d.tipo==='Curso'){d.imagem_curso=upload.publica;ed.elements.imagem_curso.value=upload.publica;}else arquivo=upload.arquivo;
  }
  if(d.tipo==='Vídeo'&&vtt.size){if(vtt.size>120000)throw Error('Legenda muito grande.');legenda=(await vtt.text()).replace(/^\uFEFF/,'');}
  await salvar('aviso',{...d,legenda,arquivo:['Vídeo','Reel'].includes(d.tipo)?arquivo:''});limpar();
 }catch(err){mensagem(err.message);}finally{enviando=false;for(const c of ed.elements)c.disabled=false;tipo();}
};
document.addEventListener('click',async e=>{
 const b=e.target.closest('button[data-edit],button[data-del],button[data-vis]');if(!b||enviando)return;b.disabled=true;
 try{if(b.dataset.edit){
  const a=estado.avisos.find(x=>x.id===b.dataset.edit);ed.reset();
  for(const k of ['id','tipo','titulo','descricao','inicio','fim','imagem_curso','inscricao_url'])ed.elements[k].value=a[k]||'';
  ed.elements.segundos.value=a.segundos||15;
  legenda=a.legenda||'';el('#vttAtual').textContent=legenda?'Legenda anexada.':'';arquivo=a.arquivo||'';el('#existente').textContent=arquivo?'Vídeo já anexado. Selecione outro para trocar.':'';tipo();ed.elements.titulo.focus();
 }else if(b.dataset.del){if(confirm('Excluir esta divulgação do totem?'))await salvar('excluir',{id:b.dataset.del});}
 else{const x=estado.itens.find(v=>v.id===b.dataset.vis);await salvar('visibilidade',{id:x.id,oculto:!x.oculto});}
 }catch(err){mensagem(err.message);}finally{b.disabled=false;}
});
limpar();carregar().catch(e=>mensagem(e.message+' Acesse a Área restrita para entrar.'));
