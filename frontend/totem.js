'use strict';
let dados, pagina=0, indice=0, oportunidade=0, oficinaAtual, ocupado=false, temporizador, assinatura='';
const turnoHora=v=>v<'13:00'?0:v<'19:00'?1:2;
const midia=a=>a.video?'<video autoplay muted playsinline loop aria-label="'+h(a.titulo)+'" src="'+h(a.video)+'">'+(a.legenda?'<track default kind="captions" srclang="pt-BR" label="Português" src="data:text/vtt;charset=utf-8,'+h(encodeURIComponent(a.legenda))+'">':'')+'</video>':a.foto?'<img alt="" src="'+h(a.foto)+'">':'';
function abrir(html){el('#detalheBody').innerHTML=html;if(!el('#detalhe').open)el('#detalhe').showModal();}
function detalhe(x){
 let html='<h2>'+h(x.titulo)+'</h2>'+midia(x)+'<p class="texto">'+h(x.descricao)+'</p>';
 if(x.tipo==='oficina'){
  const vagas=Math.max(0,Number(x.vagas)-x.inscritos);
  html+='<p>'+h(dataBR(x.data))+' · '+h(x.inicio)+'–'+h(x.termino)+' · '+h(x.local)+'<br>'+h(x.docente)+' · '+vagas+' vaga(s)</p>';
  if(vagas)html+='<form id="inscricao" autocomplete="off"><label>Nome completo<input name="nome" maxlength="254" required></label><label>E-mail<input name="email" type="email" maxlength="254" required></label><button>Confirmar inscrição</button><p role="status"></p></form>';
 }
 abrir(html);
 const form=el('#inscricao');if(form)form.onsubmit=async e=>{
  e.preventDefault();const botao=form.querySelector('button');botao.disabled=true;
  try{await pedido('totem/inscrever',{...Object.fromEntries(new FormData(form)),workshop:x.id});form.reset();if(form.isConnected)abrir('<h2>Inscrição confirmada</h2><p>'+h(x.titulo)+'</p>');await atualizar();}
  catch(err){form.querySelector('p').textContent=err.message;}finally{botao.disabled=false;}
 };
}
function relogio(){
 el('#clock').textContent=horaAtual();
 el('#dia').textContent=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'America/Sao_Paulo'}).format(new Date());
}
let escolha=null, retorno;
function voltarAoAtual(){escolha=null;pagina=0;grade();}
function adiarRetorno(){
 clearTimeout(retorno);
 if(escolha!==null)retorno=setTimeout(voltarAoAtual,60000);
}
el('#turnos').onclick=e=>{
 const b=e.target.closest('[data-turno]');if(!b)return;
 const selecionado=Number(b.dataset.turno);
 escolha=selecionado===turnoHora(horaAtual())?null:selecionado;pagina=0;adiarRetorno();grade();
};
for(const evento of ['pointerdown','keydown'])document.addEventListener(evento,adiarRetorno);
function grade(){
 const turno=escolha??turnoHora(horaAtual());
 for(const b of el('#turnos').querySelectorAll('button'))b.setAttribute('aria-pressed',String(Number(b.dataset.turno)===turno));
 const lista=(dados?.dia===diaAtual()?dados.aulas:[]).filter(a=>turnoHora(a.inicio)===turno);
 const porPagina=20;
 const total=Math.max(1,Math.ceil(lista.length/porPagina));pagina%=total;
 el('#pagina').textContent=total>1?(pagina+1)+' de '+total:'';
 const linhas=lista.slice(pagina*porPagina,(pagina+1)*porPagina);
 el('#aulas').innerHTML=linhas.map(a=>'<tr><td>'+h(a.turma)+'</td><td>'+h(a.sala)+'</td><td>'+h(a.docente)+'</td><td>'+h(a.inicio.slice(0,5))+'–'+h(a.fim.slice(0,5))+'</td></tr>').join('')||(dados?'<tr><td colspan="4">Sem aulas neste turno.</td></tr>':'');

}
function faixa(){
 const itens=(dados?.itens||[]).filter(x=>x.tipo==='noticia');
 indice%=Math.max(1,itens.length);
 const x=itens[indice];const chave=JSON.stringify([x,itens.length,indice]);if(chave===assinatura)return;
 assinatura=chave;clearTimeout(temporizador);
 el('#noticia').innerHTML=(x?midia(x):'')+'<div class="copy"><small>'+(x?.video?'Vídeo da unidade':'Notícias da unidade')+'</small><span class="regua"></span><strong>'+h(x?.titulo||'Sem notícias em exibição')+'</strong>'+(x?.descricao?'<p>'+h(x.descricao)+'</p>':'')+(itens.length>1?'<small>'+(indice+1)+' / '+itens.length+'</small>':'')+'</div>';
 if(itens.length>1)temporizador=setTimeout(()=>{indice++;faixa();},x?.video?30000:12000);
}
let listaVideos=[], chaveVideo=null, idVideo=null, tentativa;
function atualizarVideos(){
 listaVideos=(dados?.avisos||[]).filter(a=>a.tipo==='Vídeo'&&a.video);
 const i=Math.max(0,listaVideos.findIndex(a=>a.id===idVideo));
 mostrarVideo(i);
}
function mostrarVideo(i,forcar=false){
 const a=listaVideos[i];
 const chave=JSON.stringify(a||null);
 if(!forcar&&chave===chaveVideo)return;
 clearTimeout(tentativa);chaveVideo=chave;idVideo=a?.id;
 const box=el('#reel');
 if(!a){box.innerHTML='<p>Nenhum vídeo em exibição.</p>';return;}
 box.innerHTML=midia(a).replace(' loop ',' ');
 const player=box.querySelector('video');
 const seguinte=()=>mostrarVideo((listaVideos.findIndex(v=>v.id===idVideo)+1)%listaVideos.length,true);
 player.onended=()=>{if(listaVideos.length===1)player.play().catch(()=>{});else seguinte();};
 player.onerror=()=>{box.innerHTML='<p>Vídeo indisponível no momento.</p>';tentativa=setTimeout(seguinte,12000);};
}
let chaveCentro=null, tempoCentro, indiceCentro=0;
function centro(){
 const avisos=dados?.avisos||[];
 const cursos=avisos.filter(a=>a.tipo==='Curso'&&a.imagem_curso);
 const reels=avisos.filter(a=>a.tipo==='Reel'&&(a.video||/^https:\/\/www\.instagram\.com\/reel\/[A-Za-z0-9_-]+\/$/.test(a.instagram_reel)));
 const fila=[];
 for(let i=0;i<Math.max(cursos.length,reels.length);i++){
   if(cursos[i])fila.push(cursos[i]);if(reels[i])fila.push(reels[i]);
 }
 indiceCentro%=Math.max(1,fila.length);
 const item=fila[indiceCentro];
 const chave=JSON.stringify([item,fila.map(a=>a.id)]);
 if(chave===chaveCentro)return;
 chaveCentro=chave;clearTimeout(tempoCentro);
 const box=el('#centro');
 if(!item){box.innerHTML='<div class="curso-copy"><strong>Senac Salto</strong></div>';return;}
 if(item.tipo==='Curso'){
   box.innerHTML='<img alt="" src="'+h(item.imagem_curso)+'"><div class="curso-copy"><small>Cursos Senac Salto</small><strong>'+h(item.titulo)+'</strong><div class="convite"><span>Inscreva-se</span><div class="codigo"></div></div></div>';
   box.querySelector('.convite').hidden=!desenharQR(box.querySelector('.codigo'),item.inscricao_url);
 }else if(item.video){box.innerHTML=midia(item);}
 else{box.innerHTML='<iframe title="Reel do Senac Salto" src="'+h(item.instagram_reel)+'embed/" allow="autoplay; encrypted-media; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>';}
 if(fila.length>1)tempoCentro=setTimeout(()=>{indiceCentro++;centro();},item.tipo==='Curso'?15000:30000);
}
function ofertas(){
 centro();
 const oficinas=(dados?.itens||[]).filter(x=>x.tipo==='oficina');
 oficinaAtual=oficinas[oportunidade%oficinas.length];
 el('#avaliacao').hidden=!desenharQR(el('#qr-avaliacao'),dados?.horarios?.avaliacao);
 const capa=el('#oficina-foto');
 if(capa.dataset.origem!==(oficinaAtual?.foto||'')){
   capa.dataset.origem=oficinaAtual?.foto||'';capa.hidden=!oficinaAtual?.foto;
   if(oficinaAtual?.foto){capa.onerror=()=>{capa.hidden=true;};capa.src=oficinaAtual.foto;}else capa.removeAttribute('src');
 }
 el('#oficina').textContent=oficinaAtual?.titulo||'Sem oficina no momento';
 el('#inscrever').hidden=!oficinaAtual;
 el('#inscrever').textContent=oficinaAtual&&Number(oficinaAtual.vagas)>oficinaAtual.inscritos?'Inscreva-se →':'Ver oficina →';
}
async function atualizar(){
 if(ocupado)return;ocupado=true;
 try{dados=await pedido('totem');grade();faixa();atualizarVideos();ofertas();el('#horarios').innerHTML=['secretaria','biblioteca'].map(k=>'<div><b>'+h(k[0].toUpperCase()+k.slice(1))+'</b><p>'+h(dados.horarios[k])+'</p></div>').join('');el('#status').textContent='';}
 catch{if(dados?.dia!==diaAtual()){dados=null;grade();ofertas();faixa();atualizarVideos();}el('#status').textContent='Conexão indisponível · aguardando atualização.';}finally{ocupado=false;}
}
el('#inscrever').onclick=()=>{if(oficinaAtual)detalhe(oficinaAtual);};
let espera;
function limparDepois(){clearTimeout(espera);if(el('#detalhe').open)espera=setTimeout(()=>el('#detalhe').close(),60000);}
el('.fechar').onclick=()=>el('#detalhe').close();
el('#detalhe').onclose=()=>{clearTimeout(espera);el('#detalheBody').replaceChildren();};
for(const ev of ['click','input','keydown'])document.addEventListener(ev,limparDepois);
relogio();grade();atualizar();setInterval(atualizar,30000);setInterval(()=>{relogio();pagina++;grade();oportunidade++;ofertas();},15000);
