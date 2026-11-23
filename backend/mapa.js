import {createHmac, randomInt} from 'node:crypto';
import {insist} from './validation.js';
const turns={manha:['08:00','12:00'],tarde:['13:30','17:30'],noite:['19:00','22:30']};
const fixed={'01-01':'Confraternização Universal','04-21':'Tiradentes','05-01':'Dia do Trabalho','06-16':'Aniversário de Salto','07-09':'Revolução Constitucionalista','09-07':'Independência','09-08':'Padroeira de Salto','10-12':'Nossa Senhora Aparecida','11-02':'Finados','11-15':'Proclamação da República','11-20':'Consciência Negra','12-25':'Natal'};
const oneDay=86400000;
function day(value){
  insist(typeof value==='string' && /^\d{4}-\d\d-\d\d$/.test(value),'Informe uma data válida.');
  const stamp=Date.parse(value+'T00:00:00Z');
  insist(Number.isFinite(stamp) && new Date(stamp).toISOString().startsWith(value),'Data inválida.');
  return stamp;
}
const iso=stamp=>new Date(stamp).toISOString().slice(0,10);
export function holiday(value){
  if(fixed[value.slice(5)])return fixed[value.slice(5)];
  const y=Number(value.slice(0,4)),a=y%19,b=Math.floor(y/100),c=y%100;
  const h=(19*a+b-Math.floor(b/4)-Math.floor((b-Math.floor((b+8)/25)+1)/3)+15)%30;
  const l=(32+2*(b%4)+2*Math.floor(c/4)-h-c%4)%7;
  const m=Math.floor((a+11*h+22*l)/451),n=h+l-7*m+114;
  const easter=Date.UTC(y,Math.floor(n/31)-1,n%31+1);
  if(value===iso(easter-2*oneDay))return 'Paixão de Cristo';
  if(value===iso(easter+60*oneDay))return 'Corpus Christi';
  return '';
}
export function booking(b){
  const kind=b.tipo;
  insist(['aula','reuniao'].includes(kind),'Tipo inválido.');
  const [start,end]=turns[b.turno]||[b.inicio,b.fim];
  const time=/^([01]\d|2[0-3]):[0-5]\d$/;
  insist(time.test(start)&&time.test(end)&&start<end,'Confira o horário de início e término.');
  const first=day(b.data),last=day(b.ate||b.data);
  insist(last>=first && last-first<=oneDay*1096,'O período deve ter até três anos.');
  const teachers=[...new Set([b.docente,b.segundo].filter(Boolean))];
  insist(b.sala && (kind==='aula' ? b.turma && teachers.length : b.titulo?.trim()),'Complete os dados da reserva.');
  insist(!b.segundo || b.segundo!==b.docente,'Selecione dois docentes diferentes.');
  const dates=[];
  for(let d=first;d<=last;d+=oneDay){
    const date=iso(d),weekday=new Date(d).getUTCDay();
    if(last!==first && !b.dias?.includes(weekday))continue;
    if(kind==='aula' && (holiday(date)||weekday===0||(weekday===6 && (start<'08:00'||end>'12:00'))))continue;
    dates.push(date);
  }
  insist(dates.length,'Nenhuma data letiva válida nesse período e horário.');
  return {tipo:kind,sala:b.sala,turma:kind==='aula'?b.turma:null,docentes:teachers,titulo:String(b.titulo||'').trim().slice(0,180),inicio:start,fim:end,datas:dates,aceitarAviso:b.aceitarAviso===true};
}
export function pinDigest(pin,config){
  insist(typeof pin==='string' && /^\d{10}$/.test(pin),'Informe o PIN de 10 dígitos.',403);
  return createHmac('sha256',config.MAPA_PIN_SECRET||config.SUPABASE_SECRET_KEY).update('mapa:'+pin).digest('hex');
}
export const newPin=()=>String(randomInt(0,10000000000)).padStart(10,'0');
export const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
export function prepareMap(op,b){
  if(op==='criar')return booking(b);
  if(op==='alterar'){
    const value=booking({...b,ate:b.data});
    return {...value,id:b.id,escopo:b.escopo};
  }
  if(op==='dia'){day(b.data);return {data:b.data,semana:b.semana===true};}
  return b;
}
export {iso,day,oneDay};
