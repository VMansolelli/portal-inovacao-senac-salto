'use strict';
const form=el('form'),arquivo=form.elements.imagem,prev=el('#prev'),feedback=el('#retorno');
let origem;
arquivo.onchange=()=>{
 if(origem)URL.revokeObjectURL(origem);
 prev.hidden=true;prev.removeAttribute('src');arquivo.setCustomValidity('');feedback.textContent='';
 const file=arquivo.files[0];if(!file)return;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024){
   arquivo.setCustomValidity('Escolha uma foto JPG, PNG ou WebP de até 20 MB.');arquivo.reportValidity();return;
 }
 origem=URL.createObjectURL(file);prev.src=origem;prev.hidden=false;
};
form.onsubmit=async e=>{
 e.preventDefault();const botao=form.querySelector('button');if(botao.disabled)return;
 botao.disabled=true;arquivo.disabled=true;feedback.textContent='Preparando foto…';
 try{
   await prev.decode();
   const escala=Math.min(1,1080/Math.max(prev.naturalWidth,prev.naturalHeight));
   const tela=document.createElement('canvas');tela.width=Math.max(1,Math.round(prev.naturalWidth*escala));tela.height=Math.max(1,Math.round(prev.naturalHeight*escala));
   const ctx=tela.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,tela.width,tela.height);ctx.drawImage(prev,0,0,tela.width,tela.height);
   let imagem=tela.toDataURL('image/jpeg',.78);if(imagem.length>=650000)imagem=tela.toDataURL('image/jpeg',.5);
   await pedido('galeria/enviar',{imagem,aceite:form.elements.aceite.checked});
   form.reset();arquivo.onchange();feedback.textContent='Foto enviada. Ela poderá aparecer no totem depois da aprovação.';
 }catch(err){feedback.textContent=err.message||'Falha no envio. Escolha outra imagem ou tente novamente.';}
 finally{botao.disabled=false;arquivo.disabled=false;}
};
