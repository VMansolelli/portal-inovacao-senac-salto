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
 el('#dia').textContent=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long',timeZone:'America/Sao_Paulo'}).format(new Date());
}
function grade(){
 const turno=turnoHora(horaAtual());
 el('#turno').textContent=['Manhã','Tarde','Noite'][turno];
 const lista=(dados?.dia===diaAtual()?dados.aulas:[]).filter(a=>turnoHora(a.inicio)===turno);
 const porPagina=4+(window.innerHeight>=700?1:0);
 const total=Math.max(1,Math.ceil(lista.length/porPagina));pagina%=total;
 el('#pagina').textContent=total>1?(pagina+1)+' de '+total:'';
 const linhas=lista.slice(pagina*porPagina,(pagina+1)*porPagina);
 el('#aulas').innerHTML=linhas.map(a=>'<tr><td>'+h(a.turma)+'</td><td>'+h(a.sala)+'</td><td>'+h(a.docente)+'</td><td>'+h(a.inicio.slice(0,5))+'–'+h(a.fim.slice(0,5))+'</td></tr>').join('')||(dados?'<tr><td colspan="4">Sem aulas neste turno.</td></tr>':'');
}
function faixa(){
 const itens=[...(dados?.itens||[]).filter(x=>x.tipo==='noticia'),...(dados?.avisos||[]).filter(x=>x.tipo==='Vídeo')];
 indice%=Math.max(1,itens.length);
 const x=itens[indice];const chave=JSON.stringify([x,itens.length,indice]);if(chave===assinatura)return;
 assinatura=chave;clearTimeout(temporizador);
 el('#noticia').innerHTML=(x?midia(x):'')+'<div class="copy"><small>'+(x?.video?'Vídeo da unidade':'Notícias da unidade')+'</small><span class="regua"></span><strong>'+h(x?.titulo||'Sem notícias em exibição')+'</strong>'+(itens.length>1?'<small>'+(indice+1)+' / '+itens.length+'</small>':'')+'</div>';
 if(itens.length>1)temporizador=setTimeout(()=>{indice++;faixa();},x?.video?30000:12000);
}
function ofertas(){
 const cursos=(dados?.avisos||[]).filter(x=>x.tipo==='Curso');
 const oficinas=(dados?.itens||[]).filter(x=>x.tipo==='oficina');
 oficinaAtual=oficinas[oportunidade%oficinas.length];
 el('#curso').textContent=cursos[oportunidade%cursos.length]?.titulo||'Sem divulgação no momento';
 el('#oficina').textContent=oficinaAtual?.titulo||'Sem oficina no momento';
 el('#inscrever').hidden=!oficinaAtual;
 el('#inscrever').textContent=oficinaAtual&&Number(oficinaAtual.vagas)>oficinaAtual.inscritos?'Inscreva-se →':'Ver oficina →';
}
async function atualizar(){
 if(ocupado)return;ocupado=true;
 try{dados=await pedido('totem');grade();faixa();ofertas();el('#horarios').innerHTML=['secretaria','biblioteca'].map(k=>'<div><b>'+h(k[0].toUpperCase()+k.slice(1))+'</b><p>'+h(dados.horarios[k])+'</p></div>').join('');el('#status').textContent='';}
 catch{if(dados?.dia!==diaAtual()){dados=null;grade();ofertas();faixa();}el('#status').textContent='Conexão indisponível · aguardando atualização.';}finally{ocupado=false;}
}
el('#inscrever').onclick=()=>{if(oficinaAtual)detalhe(oficinaAtual);};
let espera;
function limparDepois(){clearTimeout(espera);if(el('#detalhe').open)espera=setTimeout(()=>el('#detalhe').close(),60000);}
el('.fechar').onclick=()=>el('#detalhe').close();
el('#detalhe').onclose=()=>{clearTimeout(espera);el('#detalheBody').replaceChildren();};
for(const ev of ['click','input','keydown'])document.addEventListener(ev,limparDepois);
relogio();grade();atualizar();setInterval(atualizar,30000);setInterval(()=>{relogio();pagina++;grade();oportunidade++;ofertas();},15000);
