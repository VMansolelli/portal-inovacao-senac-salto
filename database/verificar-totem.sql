-- Executar após 05-totem.sql no SQL Editor. Os dados criados são descartados.
begin;
do $$
declare nid text:=gen_random_uuid()::text; wid text:=gen_random_uuid()::text; hoje date:=(now() at time zone 'America/Sao_Paulo')::date; r jsonb;
begin
 if has_function_privilege('anon','public.totem_api(text,jsonb)','execute') or has_function_privilege('authenticated','public.totem_api(text,jsonb)','execute') then raise exception 'Permissões incorretas';end if;
 insert into portal.items(id,kind,status,body,created) values(nid,'noticia','pendente','{"titulo":"Teste"}',now()-interval '2 months');
 update portal.items set status='aprovada' where id=nid;
 if not exists(select 1 from jsonb_array_elements(public.totem_api('tela','{}')->'itens') x where x->>'id'=nid) then raise exception 'Notícia recém-aprovada ausente';end if;
 perform public.totem_api('visibilidade',jsonb_build_object('id',nid,'oculto',true));
 if exists(select 1 from jsonb_array_elements(public.totem_api('tela','{}')->'itens') x where x->>'id'=nid) then raise exception 'Notícia oculta ainda em exibição';end if;
 perform public.totem_api('visibilidade',jsonb_build_object('id',nid,'oculto',false));
 update portal.items set publicada_em=now()-interval '2 months' where id=nid;
 if exists(select 1 from jsonb_array_elements(public.totem_api('tela','{}')->'itens') x where x->>'id'=nid) then raise exception 'Notícia vencida ainda em exibição';end if;
 insert into portal.items(id,kind,status,body) values(wid,'oficina','aprovada',jsonb_build_object('data',hoje+1,'termino','16:00','vagas',1));
 perform public.totem_api('inscrever',jsonb_build_object('workshop',wid,'email','teste@example.org','nome','Teste','cargo','','area',''));
 if not exists(select 1 from portal.registrations where workshop=wid) then raise exception 'Inscrição ausente';end if;
 r:=public.totem_api('inscrever',jsonb_build_object('workshop',wid,'email','outro@example.org','nome','Outro','cargo','','area',''));
 if not(r?'conflict') then raise exception 'Oficina lotada deveria bloquear inscrição';end if;
end $$;
rollback;
