-- Teste opcional no SQL Editor depois da migração. Os registros de teste são descartados.
begin;
do $$
declare
 sala uuid; a uuid; b uuid; reserva uuid; chave uuid;
 data_local date:=(now() at time zone 'America/Sao_Paulo')::date;
 base jsonb; resp jsonb; ha text:=gen_random_uuid()::text; hb text:=gen_random_uuid()::text;
begin
 if has_function_privilege('authenticated','public.mapa_api(text,jsonb)','execute') or has_function_privilege('anon','public.mapa_api(text,jsonb)','execute') then raise exception 'RPC com acesso indevido';end if;
 insert into mapa.entidade(tipo,nome,capacidade) values('sala',ha,20) returning id into sala;
 insert into mapa.entidade(tipo,nome,pin_hash) values('docente',ha,ha) returning id into a;
 insert into mapa.entidade(tipo,nome,pin_hash) values('docente',hb,hb) returning id into b;
 resp:=public.mapa_api('desativar',jsonb_build_object('id',a));
 if resp->>'ok' is distinct from 'true' then raise exception 'Desativação: %',resp;end if;
 resp:=public.mapa_api('reativar',jsonb_build_object('id',a));
 if resp->>'ok' is distinct from 'true' or not exists(select 1 from mapa.entidade where id=a and ativo and pin_hash is null)
 then raise exception 'Reativação: %',resp;end if;
 resp:=public.mapa_api('pin',jsonb_build_object('id',a,'hash',ha));
 if resp->>'ok' is distinct from 'true' then raise exception 'Reemissão: %',resp;end if;
 base:=jsonb_build_object('tipo','reuniao','sala',sala,'datas',jsonb_build_array(data_local),'docentes',jsonb_build_array(a,b),'titulo','Teste','inicio','15:00','fim','16:00');
 resp:=public.mapa_api('criar',base);
 if resp->>'quantidade' is distinct from '1' then raise exception 'Criação: %',resp;end if;
 resp:=public.mapa_api('criar',base);
 if not(resp?'conflict') then raise exception 'Conflito de sala: %',resp;end if;
 select id into strict reserva from mapa.reserva r where r.sala=(base->>'sala')::uuid;
 base:=jsonb_build_object('sala',sala,'reserva',reserva,'hash',ha);
 resp:=public.mapa_api('retirar',base);
 if resp->>'ok' is distinct from 'true' then raise exception 'Retirada: %',resp;end if;
 resp:=public.mapa_api('retirar',base);
 if not(resp?'conflict') then raise exception 'Segunda retirada: %',resp;end if;
 select id into strict chave from mapa.chave k where k.reserva=(base->>'reserva')::uuid;
 resp:=public.mapa_api('devolver',base||jsonb_build_object('hash',hb,'movimento',chave));
 if resp->>'ok' is distinct from 'true' then raise exception 'Devolução pelo segundo docente: %',resp;end if;
end $$;
rollback;
