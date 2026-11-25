begin;
create table if not exists mapa.chaves_excel(
 id uuid primary key, dia date not null, aula jsonb not null, sala text not null,
 retirante text not null, retirada timestamptz not null default now(),
 devolvente text, devolucao timestamptz
);
create unique index if not exists chave_excel_em_uso on mapa.chaves_excel(sala) where devolucao is null;
create index if not exists chave_excel_dia on mapa.chaves_excel(dia);
revoke all on mapa.chaves_excel from public,anon,authenticated;
create or replace function public.chaves_excel_api(op text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare hoje date:=(now() at time zone 'America/Sao_Paulo')::date;
 folha mapa.excel_dia; item jsonb; chave text; resultado jsonb; data_rel date;
begin
 if op='balcao' then
   select * into folha from mapa.excel_dia where dia=hoje;
   return jsonb_build_object('dia',hoje,'revisao',folha.revisao,
    'aulas',coalesce((select jsonb_agg(a||jsonb_build_object('indice',n-1,'ocupada',exists(
      select 1 from mapa.chaves_excel m where m.sala=lower(regexp_replace(trim(a->>'sala'),'\s+',' ','g')) and m.devolucao is null)) order by n)
      from jsonb_array_elements(folha.aulas) with ordinality as t(a,n)),'[]'),
    'abertas',coalesce((select jsonb_agg(jsonb_build_object('id',id,'aula',aula,'dia',dia) order by retirada)
      from mapa.chaves_excel where devolucao is null),'[]'));
 elsif op='pegar' then
   select * into folha from mapa.excel_dia where dia=hoje for share;
   if folha.revisao is null or folha.revisao::text is distinct from p->>'revisao' then
     return '{"conflict":"O mapa mudou. Atualize a lista e selecione a aula novamente."}';end if;
   item:=folha.aulas->((p->>'indice')::integer);
   if item is null then return '{"conflict":"Aula indisponível. Atualize a lista."}';end if;
   chave:=lower(regexp_replace(trim(item->>'sala'),'\s+',' ','g'));
   insert into mapa.chaves_excel(id,dia,aula,sala,retirante)
   values((p->>'pedido')::uuid,hoje,item,chave,p->>'nome') on conflict do nothing;
   if not found and not exists(select 1 from mapa.chaves_excel where id=(p->>'pedido')::uuid and sala=chave and dia=hoje and retirante=p->>'nome') then
    return '{"conflict":"Esta chave já foi retirada. Atualize a lista."}';end if;
 elsif op='entregar' then
   update mapa.chaves_excel set devolucao=now(),devolvente=p->>'nome' where id=(p->>'id')::uuid and devolucao is null;
   if not found then return '{"conflict":"Esta retirada não está mais aberta. Atualize a lista."}';end if;
 elsif op='relatorio' then
   data_rel:=(p->>'data')::date;
   select coalesce(jsonb_agg(to_jsonb(m) order by retirada desc),'[]') into resultado from mapa.chaves_excel m
   where dia=data_rel or (devolucao at time zone 'America/Sao_Paulo')::date=data_rel or devolucao is null;
   return resultado;
 else raise exception 'Operação inválida';end if;
 return '{"ok":true}';
end $$;
revoke all on function public.chaves_excel_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.chaves_excel_api(text,jsonb) to service_role;
create or replace function public.totem_api(op text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare hoje date:=(now() at time zone 'America/Sao_Paulo')::date; local_agora timestamp:=now() at time zone 'America/Sao_Paulo'; grupo jsonb; avisos jsonb; horarios jsonb;
begin
 if op in ('tela','editor') then
  select to_jsonb(h)-'id' into horarios from portal.totem_horarios h;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.inicio desc,a.id),'[]') into avisos from portal.totem_avisos a where op='editor' or hoje between a.inicio and a.fim;
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'tipo',i.kind,'titulo',body->>'titulo','descricao',body->>'descricao','docente',body->>'docente','local',body->>'local','data',body->>'data','inicio',body->>'inicio','termino',body->>'termino','vagas',body->>'vagas','inscritos',inscritos,'foto',case when body ? 'imagem' then '/api/foto/'||i.id||case when i.kind='oficina' and body ? 'capa_versao' then '?v='||(body->>'capa_versao') else '' end end,'oculto',o.id is not null) order by coalesce(i.publicada_em,i.created) desc),'[]') into grupo
  from portal.items i left join portal.totem_ocultos o on o.id=i.id
  where i.status='aprovada' and (op='editor' or o.id is null) and ((i.kind='oficina' and (body->>'data')::date+(body->>'termino')::time>local_agora) or (i.kind='noticia' and i.publicada_em+interval '1 month'>now()));
  return jsonb_build_object('dia',hoje,'itens',grupo,'avisos',avisos,'horarios',horarios,'aulas',
   coalesce((select e.aulas from mapa.excel_dia e where e.dia=hoje),'[]'::jsonb));
 elsif op='inscrever' then
  perform 1 from portal.items i where i.id=p->>'workshop' and i.kind='oficina' and i.status='aprovada'
    and (i.body->>'data')::date+(i.body->>'termino')::time>local_agora
    and not exists(select 1 from portal.totem_ocultos o where o.id=i.id) for update;
  if not found then return '{"conflict":"Esta oficina encerrou ou saiu do totem."}';end if;
  return public.portal_api('inscrever',p);
 elsif op='visibilidade' then
  if (p->>'oculto')::boolean then insert into portal.totem_ocultos values(p->>'id') on conflict do nothing;else delete from portal.totem_ocultos where id=p->>'id';end if;
 elsif op='horarios' then update portal.totem_horarios set noticia_segundos=coalesce((p->>'noticia_segundos')::integer,noticia_segundos),ambientes=coalesce(p->'ambientes',ambientes),secretaria=coalesce(p->>'secretaria',secretaria),biblioteca=coalesce(p->>'biblioteca',biblioteca),avaliacao=coalesce(p->>'avaliacao',avaliacao) where id;
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
