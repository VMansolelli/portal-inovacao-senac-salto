begin;
alter table portal.totem_horarios add column if not exists ambientes jsonb;
update portal.totem_horarios set ambientes=jsonb_build_array(
 jsonb_build_object('nome','Secretaria','horario',secretaria,'telefone',''),
 jsonb_build_object('nome','Biblioteca','horario',biblioteca,'telefone','')
) where ambientes is null;
alter table portal.totem_avisos add column if not exists segundos integer not null default 15 check(segundos between 1 and 3600);
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
   (select coalesce(jsonb_agg(jsonb_build_object('sala',q.sala_nome,'turma',q.turma_nome,'curso',q.curso_nome,'docente',q.professores,'inicio',q.inicio,'fim',q.fim) order by q.inicio,q.turma_nome),'[]') from mapa.quadro q where q.dia=hoje and q.tipo='aula'));
 elsif op='inscrever' then
  perform 1 from portal.items i where i.id=p->>'workshop' and i.kind='oficina' and i.status='aprovada'
    and (i.body->>'data')::date+(i.body->>'termino')::time>local_agora
    and not exists(select 1 from portal.totem_ocultos o where o.id=i.id) for update;
  if not found then return '{"conflict":"Esta oficina encerrou ou saiu do totem."}';end if;
  return public.portal_api('inscrever',p);
 elsif op='visibilidade' then
  if (p->>'oculto')::boolean then insert into portal.totem_ocultos values(p->>'id') on conflict do nothing;else delete from portal.totem_ocultos where id=p->>'id';end if;
 elsif op='horarios' then update portal.totem_horarios set ambientes=coalesce(p->'ambientes',ambientes),secretaria=coalesce(p->>'secretaria',secretaria),biblioteca=coalesce(p->>'biblioteca',biblioteca),avaliacao=coalesce(p->>'avaliacao',avaliacao) where id;
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
