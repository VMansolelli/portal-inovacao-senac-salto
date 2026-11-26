begin;
create or replace function public.fotos_comunidade_api(op text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 case op
 when 'enviar' then insert into portal.fotos_comunidade(imagem) values(p->>'imagem');
 when 'lista' then
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'estado',estado,'enviada',enviada) order by ordem nulls last,enviada desc,id),'[]') into r from portal.fotos_comunidade;return r;
 when 'publica','revisao' then
   select to_jsonb(imagem) into r from portal.fotos_comunidade where id=(p->>'id')::uuid and (estado='aprovada' or op='revisao');return r;
 when 'excluir' then
   delete from portal.fotos_comunidade where id=(p->>'id')::uuid and estado=p->>'estado';
   if not found then return '{"conflict":"Atualize a lista de fotos."}';end if;
 when 'reexibir' then
   update portal.fotos_comunidade set estado='aprovada',ordem=null where id=(p->>'id')::uuid and estado='arquivada';
   if not found then return '{"conflict":"Atualize a lista de fotos."}';end if;
 when 'aprovar','arquivar','rejeitar' then
   if op='rejeitar' then delete from portal.fotos_comunidade where id=(p->>'id')::uuid and estado='pendente';
   else update portal.fotos_comunidade set estado=case when op='aprovar' then 'aprovada' else 'arquivada' end
     where id=(p->>'id')::uuid and estado=case when op='aprovar' then 'pendente' else 'aprovada' end;end if;
   if not found then return '{"conflict":"Esta foto já foi avaliada. Atualize a lista."}';end if;
 else raise exception 'Operação desconhecida';end case;
 return '{"ok":true}';
end $$;
revoke all on function public.fotos_comunidade_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.fotos_comunidade_api(text,jsonb) to service_role;
create or replace function public.totem_api(op text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare hoje date:=(now() at time zone 'America/Sao_Paulo')::date; local_agora timestamp:=now() at time zone 'America/Sao_Paulo'; grupo jsonb; avisos jsonb; horarios jsonb;
begin
 if op in ('tela','editor') then
  select to_jsonb(h)-'id' into horarios from portal.totem_horarios h;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.ordem nulls last,a.inicio desc,a.id),'[]') into avisos from portal.totem_avisos a where op='editor' or hoje between a.inicio and a.fim;
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'tipo',i.kind,'titulo',body->>'titulo','descricao',body->>'descricao','docente',body->>'docente','local',body->>'local','data',body->>'data','inicio',body->>'inicio','termino',body->>'termino','vagas',body->>'vagas','inscritos',inscritos,'encerrada',case when i.kind='oficina' then (body->>'data')::date+(body->>'termino')::time<=local_agora else false end,'foto',case when body ? 'imagem' then '/api/foto/'||i.id||case when i.kind='oficina' and body ? 'capa_versao' then '?v='||(body->>'capa_versao') else '' end end,'oculto',o.id is not null) order by coalesce(i.publicada_em,i.created) desc),'[]') into grupo
  from portal.items i left join portal.totem_ocultos o on o.id=i.id
  where i.status='aprovada' and (op='editor' or o.id is null) and ((i.kind='oficina') or (i.kind='noticia' and i.publicada_em+interval '1 month'>now()));
  return jsonb_build_object('dia',hoje,'fotos',(select coalesce(jsonb_agg(f.id order by f.ordem nulls last,f.enviada desc,f.id),'[]') from portal.fotos_comunidade f where f.estado='aprovada'),'itens',grupo,'avisos',avisos,'horarios',horarios,'aulas',
   coalesce((select jsonb_agg(a||jsonb_build_object('chave_retirada',exists(
     select 1 from mapa.chaves_excel m where m.devolucao is null and m.sala=lower(regexp_replace(trim(a->>'sala'),'\s+',' ','g'))
   )) order by n) from mapa.excel_dia e cross join lateral jsonb_array_elements(e.aulas) with ordinality t(a,n) where e.dia=hoje),'[]'::jsonb));
 elsif op in ('inscrever','inscrever-portal') then
  perform 1 from portal.items i where i.id=p->>'workshop' and i.kind='oficina' and i.status='aprovada'
    and (i.body->>'data')::date+(i.body->>'termino')::time>local_agora
    and (op='inscrever-portal' or not exists(select 1 from portal.totem_ocultos o where o.id=i.id)) for update;
  if not found then return '{"conflict":"Esta oficina encerrou ou saiu do totem."}';end if;
  return public.portal_api('inscrever',p);
 elsif op='visibilidade' then
  if (p->>'oculto')::boolean then insert into portal.totem_ocultos values(p->>'id') on conflict do nothing;else delete from portal.totem_ocultos where id=p->>'id';end if;
 elsif op='horarios' then update portal.totem_horarios set arte_reserva=coalesce(p->>'arte_reserva',arte_reserva),noticia_segundos=coalesce((p->>'noticia_segundos')::integer,noticia_segundos),ambientes=coalesce(p->'ambientes',ambientes),secretaria=coalesce(p->>'secretaria',secretaria),biblioteca=coalesce(p->>'biblioteca',biblioteca),avaliacao=coalesce(p->>'avaliacao',avaliacao) where id;
 elsif op='excluir' then delete from portal.totem_avisos where id=(p->>'id')::uuid;
 elsif op='aviso' then
  if (p->>'tipo'='Vídeo' or (p->>'tipo'='Reel' and nullif(p->>'arquivo','') is not null)) and not exists(select 1 from storage.objects where bucket_id='totem-videos' and name=p->>'arquivo') then raise exception 'Arquivo indisponível';end if;
  if nullif(p->>'id','') is null then
   insert into portal.totem_avisos(tipo,titulo,descricao,arquivo,legenda,segundos,instagram_reel,imagem_curso,inscricao_url,inicio,fim) values(p->>'tipo',p->>'titulo',p->>'descricao',p->>'arquivo',p->>'legenda',coalesce((p->>'segundos')::integer,15),p->>'instagram_reel',p->>'imagem_curso',p->>'inscricao_url',(p->>'inicio')::date,(p->>'fim')::date);
  else update portal.totem_avisos set segundos=coalesce((p->>'segundos')::integer,segundos),tipo=p->>'tipo',titulo=p->>'titulo',descricao=p->>'descricao',arquivo=p->>'arquivo',legenda=p->>'legenda',instagram_reel=coalesce(p->>'instagram_reel',instagram_reel),imagem_curso=coalesce(p->>'imagem_curso',imagem_curso),inscricao_url=coalesce(p->>'inscricao_url',inscricao_url),inicio=(p->>'inicio')::date,fim=(p->>'fim')::date where id=(p->>'id')::uuid;
   if not found then return '{"conflict":"Divulgação já removida."}';end if;
  end if;
 else raise exception 'Operação inválida';end if;
 return '{"ok":true}';
end $$;
revoke all on function public.totem_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.totem_api(text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
