import test from 'node:test';
import assert from 'node:assert/strict';
import {booking,holiday,prepareMap} from './mapa.js';
const aula={tipo:'aula',turma:'TI1.26',sala:'Sala 1',docente:'A',segundo:'B',turno:'manha',data:'2026-11-16',ate:'2026-11-22'};
test('Aulas recorrentes ignoram feriado e domingo e respeitam o turno de sábado',()=>{
 const b=booking({...aula,dias:[1,3,5,6,0]});
 assert.deepEqual(b.datas,['2026-11-16','2026-11-18','2026-11-21']);
 assert.deepEqual(b.docentes,['A','B']);
 assert.deepEqual([b.inicio,b.fim],['08:00','12:00']);
 for(const [turno,inicio,fim] of [['tarde','13:30','17:30'],['noite','19:00','22:30']]){
  const r=booking({...aula,turno,dias:[1,6]});
  assert.deepEqual(r.datas,['2026-11-16']);assert.deepEqual([r.inicio,r.fim],[inicio,fim]);
 }
});
test('Reunião avulsa usa o horário informado e edição de uma aula valida a nova data',()=>{
 const b=booking({...aula,tipo:'reuniao',titulo:'Planejamento',ate:aula.data,turno:'livre',inicio:'15:00',fim:'16:00'});
 assert.deepEqual([b.inicio,b.fim,b.turma],['15:00','16:00',null]);
 assert.throws(()=>prepareMap('alterar',{...aula,data:'2026-11-20',escopo:'uma'}));
 assert.throws(()=>booking({...aula,data:'2026-02-30'}));
 assert.ok(holiday('2026-04-03'));assert.ok(holiday('2026-06-04'));assert.ok(holiday('2026-09-08'));
});

test('PIN docente e administrativo preservam comprimento e zeros iniciais',async()=>{
 const {newPin,pinDigest}=await import('./mapa.js');
 const config={MAPA_PIN_SECRET:'teste-local'};
 for(let i=0;i<20;i++){
  assert.match(newPin(),/^\d{4}$/);assert.match(newPin(true),/^\d{10}$/);
 }
 assert.notEqual(pinDigest('0001',config),pinDigest('0000000001',config));
 assert.throws(()=>pinDigest('123',config));
});
