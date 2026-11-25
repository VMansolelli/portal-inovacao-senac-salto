'use strict';
function lerMapaExcel(texto){
 const normal=v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const turnos=['manha','tarde','noite'],vistos=new Set(),aulas=[];
 let turno=-1;
 // O Excel delimita com aspas as células com quebras de linha.
 const linhas=[];let linha=[],valor='',aspas=false;
 for(let i=0;i<texto.length;i++){
   const c=texto[i];
   if(c==='"'&&(aspas||valor==='')){
     if(aspas&&texto[i+1]==='"'){valor+='"';i++;}else aspas=!aspas;
   }else if(!aspas&&(c==='\t'||c==='\n'||c==='\r')){
     linha.push(valor.trim());valor='';
     if(c!=='\t'){linhas.push(linha);linha=[];if(c==='\r'&&texto[i+1]==='\n')i++;}
   }else valor+=c;
 }
 if(aspas)throw Error('Uma célula ficou incompleta. Copie o resumo novamente.');
 linha.push(valor.trim());linhas.push(linha);
 for(const [i,col] of linhas.entries()){
   const [turma,horario='',sala='',docente='']=col;
   if(!col.some(Boolean))continue;
   if(normal(turma)==='turno'){
     turno=turnos.indexOf(normal(horario));if(turno<0||vistos.has(turno))throw Error('Confira o cabeçalho de turno na linha '+(i+1)+'.');
     vistos.add(turno);continue;
   }
   if(normal(turma)==='turma'&&normal(sala)==='local')continue;
   if(turno<0||!turma||!sala)throw Error('Confira a linha '+(i+1)+'. Copie da célula A5 até a coluna D da última atividade.');
   aulas.push({turma,sala,docente,horario,turno,incluir:!(/\breuniao\b|\breunioes\b/.test(normal(turma)))});
 }
 if(vistos.size!==3)throw Error('Inclua os cabeçalhos Manhã, Tarde e Noite, mesmo quando um turno estiver vazio.');
 if(!aulas.length)throw Error('O resumo está vazio. Gere o mapa do dia no Excel antes de copiar.');
 return aulas;
}
function abrirImportacao(pagina,pedir){
 const turnos=['Manhã','Tarde','Noite'];
 pagina.innerHTML='<h2>Publicar mapa do Excel</h2><p>Na aba Salas, copie de A5 até a coluna D da última atividade, incluindo os três turnos. Confira a data em B1.</p><label>Data do mapa<input type="date" required></label><label>Resumo copiado do Excel<textarea rows="7" placeholder="Cole aqui com Ctrl + V"></textarea></label><button type="button" class="primary">Conferir mapa</button><p role="status"></p><div class="conferencia"></div>';
 const data=pagina.querySelector('input'),texto=pagina.querySelector('textarea'),conferir=pagina.querySelector('button'),msg=pagina.querySelector('[role=status]'),painel=pagina.querySelector('.conferencia');
 let versao=0;
 function invalidar(){versao++;painel.replaceChildren();msg.textContent='';}
 data.oninput=texto.oninput=invalidar;
 conferir.onclick=async()=>{
   invalidar();const rodada=versao,dia=data.value;
   try{
     if(!dia)throw Error('Escolha a mesma data que aparece em B1 na aba Salas.');
     const aulas=lerMapaExcel(texto.value),anterior=await pedir('excel-consultar',{data:dia});
     if(rodada!==versao)return;
     painel.innerHTML='<h3>Conferência · '+esc(dia.split('-').reverse().join('/'))+'</h3><p>'+ (anterior.revisao?'Já existe um mapa publicado para esta data. Ao publicar, você substituirá os três turnos.':'Este mapa entrará no totem na data escolhida.')+'</p><p>Desmarque as atividades internas. Linhas sem horário ou docente aparecem com um traço.</p>';
     for(let t=0;t<3;t++){
       const titulo=document.createElement('h4');titulo.textContent=turnos[t];painel.append(titulo);
       for(const a of aulas.filter(a=>a.turno===t)){
         const label=document.createElement('label'),check=document.createElement('input');
         check.type='checkbox';check.checked=a.incluir;check.style.width='auto';check.onchange=()=>{a.incluir=check.checked;};
         label.style.cssText='display:flex;align-items:center;gap:.6em;padding:.3em 0';
         label.append(check,document.createTextNode([a.turma,a.sala,a.horario||'—',a.docente||'—'].join(' · ')));painel.append(label);
       }
     }
     const salvar=document.createElement('button');salvar.textContent='Publicar mapa de '+dia.split('-').reverse().join('/');salvar.className='primary';painel.append(salvar);
     salvar.onclick=async()=>{
       const selecionadas=aulas.filter(a=>a.incluir).map(({incluir,...a})=>a);
       if(!selecionadas.length){msg.textContent='Selecione pelo menos uma atividade.';return;}
       if(anterior.revisao&&!confirm('Substituir o mapa publicado desta data?'))return;
       salvar.disabled=conferir.disabled=data.disabled=texto.disabled=true;
       try{await pedir('excel-publicar',{data:dia,revisao:anterior.revisao,aulas:selecionadas});painel.replaceChildren();msg.textContent='Mapa publicado para '+dia.split('-').reverse().join('/')+' · '+selecionadas.length+' atividades.';}
       catch(err){msg.textContent=err.message;}
       finally{salvar.disabled=conferir.disabled=data.disabled=texto.disabled=false;}
     };
   }catch(err){if(versao===rodada)msg.textContent=err.message;}
 };
}
