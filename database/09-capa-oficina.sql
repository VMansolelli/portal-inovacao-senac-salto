begin;
create or replace function portal.manter_imagem_oficina() returns trigger language plpgsql as $$
begin
 if new.kind <> 'oficina' then return new; end if;
 if not (new.body ? 'imagem') and old.body ? 'imagem' then
   new.body := new.body || jsonb_build_object('imagem',old.body->'imagem');
 end if;
 if new.body->'imagem' is distinct from old.body->'imagem' then
   new.body := new.body || jsonb_build_object('capa_versao',gen_random_uuid()::text);
 elsif old.body ? 'capa_versao' then
   new.body := new.body || jsonb_build_object('capa_versao',old.body->'capa_versao');
 end if;
 return new;
end $$;
drop trigger if exists manter_imagem_oficina on portal.items;
create trigger manter_imagem_oficina before update of body on portal.items
for each row execute function portal.manter_imagem_oficina();
create or replace function public.totem_api(op text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare hoje date:=(now() at time zone 'America/Sao_Paulo')::date; local_agora timestamp:=now() at time zone 'America/Sao_Paulo'; grupo jsonb; avisos jsonb; horarios jsonb;
begin
 if op in ('tela','editor') then
  select to_jsonb(h)-'id' into horarios from portal.totem_horarios h;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.inicio desc,a.id),'[]') into avisos from portal.totem_avisos a where op='editor' or hoje between a.inicio and a.fim;
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'tipo',i.kind,'titulo',body->>'titulo','descricao',body->>'descricao','docente',body->>'docente','local',body->>'local','data',body->>'data','inicio',body->>'inicio','termino',body->>'termino','vagas',body->>'vagas','inscritos',inscritos,'foto',case when body ? 'imagem' then '/api/foto/'||i.id||case when i.kind='oficina' and body ? 'capa_versao' then '?v='||(body->>'capa_versao') else '' end end,'oculto',o.id is not null) order by coalesce(i.publicada_em,i.created) desc),'[]') into grupo
  from portal.items i left join portal.totem_ocultos o on o.id=i.id
  where i.status='aprovada' and (op='editor' or o.id is null) and (i.kind='acao' or (i.kind='oficina' and (body->>'data')::date+(body->>'termino')::time>local_agora) or (i.kind='noticia' and i.publicada_em+interval '1 month'>now()));
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
 elsif op='horarios' then update portal.totem_horarios set secretaria=p->>'secretaria',biblioteca=p->>'biblioteca',avaliacao=coalesce(p->>'avaliacao',avaliacao) where id;
 elsif op='excluir' then delete from portal.totem_avisos where id=(p->>'id')::uuid;
 elsif op='aviso' then
  if (p->>'tipo'='Vídeo' or (p->>'tipo'='Reel' and nullif(p->>'arquivo','') is not null)) and not exists(select 1 from storage.objects where bucket_id='totem-videos' and name=p->>'arquivo') then raise exception 'Arquivo indisponível';end if;
  if nullif(p->>'id','') is null then
   insert into portal.totem_avisos(tipo,titulo,descricao,arquivo,legenda,instagram_reel,imagem_curso,inscricao_url,inicio,fim) values(p->>'tipo',p->>'titulo',p->>'descricao',p->>'arquivo',p->>'legenda',p->>'instagram_reel',p->>'imagem_curso',p->>'inscricao_url',(p->>'inicio')::date,(p->>'fim')::date);
  else update portal.totem_avisos set tipo=p->>'tipo',titulo=p->>'titulo',descricao=p->>'descricao',arquivo=p->>'arquivo',legenda=p->>'legenda',instagram_reel=coalesce(p->>'instagram_reel',instagram_reel),imagem_curso=coalesce(p->>'imagem_curso',imagem_curso),inscricao_url=coalesce(p->>'inscricao_url',inscricao_url),inicio=(p->>'inicio')::date,fim=(p->>'fim')::date where id=(p->>'id')::uuid;
   if not found then return '{"conflict":"Divulgação já removida."}';end if;
  end if;
 else raise exception 'Operação inválida';end if;
 return '{"ok":true}';
end $$;
revoke all on function public.totem_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.totem_api(text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
