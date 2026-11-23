'use strict';
let dados,turno,grupo='Todos',ocioso,slideTimer,indice=0,carregando=false;
let pagina=0;
const turnos=['Manhã','Tarde','Noite'];
const turnoHora=hora=>hora<'13:00'?0:hora<'19:00'?1:2;
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const midia=a=>a.video?'<video autoplay muted playsinline loop aria-label="'+h(a.titulo)+'" src="'+h(a.video)+'">'+(a.legenda?'<track default kind="captions" srclang="pt-BR" label="Português" src="data:text/vtt;charset=utf-8,'+h(encodeURIComponent(a.legenda))+'">':'')+'</video>':a.foto?'<img alt="" src="'+h(a.foto)+'">':'';
function eventos(){return dados?[...dados.avisos,...dados.itens]:[];}
function botoes(id,nomes,ativo,click){
 const nav=el(id);nav.replaceChildren();
 for(const nome of nomes){const b=document.createElement('button');b.textContent=nome;b.setAttribute('aria-pressed',String(nome===ativo));b.onclick=()=>click(nome);nav.append(b);}
}
function aulas(){
 const busca=norm(el('#busca').value.trim());const rows=(dados?.aulas||[]).filter(a=>(busca||turnoHora(a.inicio)===turno)&&norm([a.turma,a.curso,a.docente,a.sala].join(' ')).includes(busca));
 botoes('#turnos',turnos,busca?'':turnos[turno],v=>{el('#busca').value='';turno=turnos.indexOf(v);pagina=0;aulas();});
 const ultima=Math.max(0,Math.ceil(rows.length/5)-1);pagina=Math.min(pagina,ultima);
 const visiveis=rows.slice(5*pagina,5*pagina+5);
 el('#aulas').innerHTML=(busca?'<p>Resultados em todos os turnos de hoje</p>':'')+visiveis.map((a,i)=>'<button class="aula" data-planta="'+i+'"><span><b>'+h(a.turma)+'</b><small>'+h(a.curso)+' · '+h(a.docente)+'</small></span><span><strong>'+h(a.sala)+'</strong><small>'+h(a.inicio.slice(0,5))+' – '+h(a.fim.slice(0,5))+'</small></span></button>').join('')+(rows.length?'':'<p>Nenhuma aula encontrada.</p>')+(ultima?'<div class="paginacao"><button data-pag="-1" '+(pagina===0?'disabled':'')+'>Anterior</button> '+(pagina+1)+' / '+(ultima+1)+' <button data-pag="1" '+(pagina===ultima?'disabled':'')+'>Próxima</button></div>':'');
 el('#aulas').onclick=e=>{const pg=e.target.closest('[data-pag]');if(pg){pagina+=Number(pg.dataset.pag);aulas();return;}const b=e.target.closest('[data-planta]');if(b)planta(visiveis[Number(b.dataset.planta)]);};
}
function abrir(html){el('#detalheBody').innerHTML=html;if(!el('#detalhe').open)el('#detalhe').showModal();}
function planta(a){
 const salas=[...new Set(['Sala 1','Sala 2','Sala 3','Lab Digital 4','Lab Software 5','Sala 6','Sala 7','Lab Software 8','Lab Hardware 9','Sala 10','Sala 11','Lab Gastronomia 12','Lab Bar 13','Lab Bem Estar 14','Sala 15','Sala 16','Lab Beleza 17','Auditório','Biblioteca',a.sala])].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
 abrir('<h2>'+h(a.sala)+'</h2><p>'+h(a.turma)+' · '+h(a.docente)+'</p><h3>Planta ilustrativa</h3><p>As posições são simuladas. Para orientação física, consulte a recepção.</p><div class="planta">'+salas.map(s=>'<span class="'+(s===a.sala?'selecionada':'')+'">'+h(s)+'</span>').join('')+'</div>');
}
function mural(){
 const all=eventos();
 botoes('#tipos',['Todos','Notícias','Oficinas','Cursos','Ações','Vídeos'],grupo,v=>{grupo=v;mural();});
 const lista=all.filter(x=>grupo==='Todos'||tipoNome[x.tipo]===grupo);
 el('#mural').innerHTML=lista.map((x,i)=>'<button class="post" data-item="'+i+'">'+(x.foto?'<img alt="" loading="lazy" src="'+h(x.foto)+'">':'')+'<small>'+h(tipoNome[x.tipo])+'</small><strong>'+h(x.titulo)+'</strong><span>'+(x.tipo==='oficina'?'Ver vagas e inscrição':'Ver detalhes')+' →</span></button>').join('')||(dados?'<p>Nenhuma divulgação neste momento.</p>':'');
 el('#mural').onclick=e=>{const b=e.target.closest('[data-item]');if(b)detalhe(lista[Number(b.dataset.item)]);};
}
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
function proximo(){
 const all=eventos();const x=all.length?all[indice++%all.length]:null;
 el('#slide').innerHTML=x?midia(x)+'<small>'+h(tipoNome[x.tipo])+'</small><strong>'+h(x.titulo)+'</strong><span>'+h(x.descricao||'')+'</span>':'<strong>Encontre sua sala</strong><span>Consulte sua turma e os horários de hoje.</span>';
 clearTimeout(slideTimer);slideTimer=setTimeout(proximo,x?.video?30000:12000);
}
function repouso(){
 el('#detalhe').close();el('#detalheBody').replaceChildren();el('#busca').value='';pagina=0;grupo='Todos';turno=turnoHora(horaAtual());if(dados){aulas();mural();}
 window.scrollTo(0,0);el('#repouso').hidden=false;el('#acordar').focus();proximo();
}
function contar(){clearTimeout(ocioso);if(el('#repouso').hidden)ocioso=setTimeout(repouso,60000);}
el('#acordar').onclick=()=>{el('#repouso').hidden=true;clearTimeout(slideTimer);el('#slide').replaceChildren();contar();};
for(const ev of ['pointerdown','input','keydown','scroll'])document.addEventListener(ev,contar,{passive:true,capture:true});
el('.fechar').onclick=()=>el('#detalhe').close();
el('#detalhe').onclose=()=>el('#detalheBody').replaceChildren();
el('#busca').oninput=()=>{pagina=0;aulas();};
async function atualizar(){
 if(carregando)return;carregando=true;
 try{const novo=await pedido('totem');if(!dados||dados.dia!==novo.dia)turno=turnoHora(horaAtual());dados=novo;
 el('#dia').textContent=dataBR(novo.dia);aulas();mural();
 el('#horarios').innerHTML=['secretaria','biblioteca'].map(k=>'<div><b>'+h(k[0].toUpperCase()+k.slice(1))+'</b><p>'+h(novo.horarios[k])+'</p></div>').join('');
 el('#status').textContent='';
 }catch(err){if(dados&&dados.dia!==diaAtual()){dados=null;el('#aulas').replaceChildren();el('#mural').replaceChildren();el('#dia').textContent=dataBR(diaAtual());}el('#status').textContent='Atualização indisponível. '+(dados?'Exibindo a última consulta.':'Tentaremos novamente em instantes.');}
 finally{carregando=false;}
}
turno=turnoHora(horaAtual());el('#clock').textContent=horaAtual();
setInterval(()=>el('#clock').textContent=horaAtual(),10000);setInterval(atualizar,30000);atualizar();contar();
