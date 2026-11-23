'use strict';
const el=s=>document.querySelector(s);
const h=v=>String(v??'').replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k]));
async function pedido(op,d){
 const r=await fetch('/api/'+op,{method:d?'POST':'GET',cache:'no-store',headers:d?{'Content-Type':'application/json'}:{},body:d?JSON.stringify(d):undefined});
 const j=await r.json().catch(()=>({erro:'Confira a conexão do totem.'}));
 if(!r.ok)throw Error(j.erro||'Não foi possível concluir.');return j;
}
const dataBR=v=>v?.split('-').reverse().join('/');
const horaAtual=()=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
const diaAtual=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
const tipoNome={noticia:'Notícias',acao:'Ações',oficina:'Oficinas',Curso:'Cursos',Ação:'Ações',Vídeo:'Vídeos'};
