begin;
create or replace function public.portal_api(op text, p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 result jsonb;
 item_kind text;
begin
 case op
 when 'publico','admin/lista' then
  select coalesce(jsonb_agg(
    (case when op='publico' then body-'imagem'-'email' else body-'imagem' end)
    || jsonb_build_object('id',id,'kind',kind,'status',status,'created',created,'inscritos',inscritos,
       'foto',case when body ? 'imagem' then '/api/foto/'||id end) order by created desc,id
  ),'[]'::jsonb) into result from portal.items
  where op='admin/lista' or (status='aprovada' and kind in ('acao','oficina','noticia'));
  return result;
 when 'foto','admin/foto' then
  select body->'imagem' into result from portal.items
    where id=p->>'id' and (status='aprovada' or op='admin/foto');
  return result;
 when 'admin/inscritos' then
  select coalesce(jsonb_agg(to_jsonb(r)-'workshop' order by r.nome,r.email),'[]'::jsonb)
   into result from portal.registrations r where workshop=p->>'id';
  return result;
 when 'noticia','oficina','ideia','admin/acao' then
  item_kind:=case when op='admin/acao' then 'acao' else op end;
  insert into portal.items(id,kind,status,body) values (gen_random_uuid()::text,item_kind,
   case when item_kind='acao' then 'aprovada' else 'pendente' end,p);
 when 'inscrever' then
  update portal.items set inscritos=inscritos+1 where id=p->>'workshop' and kind='oficina'
    and status='aprovada' and inscritos<(body->>'vagas')::integer;
  if not found then return '{"conflict":"Esta oficina está indisponível ou lotada."}'; end if;
  insert into portal.registrations values(p->>'workshop',lower(p->>'email'),p->>'nome',p->>'cargo',p->>'area');
 when 'admin/editar' then
  update portal.items set body=p-'id'-'localLegado' where id=p->>'id' and kind='oficina'
    and (not coalesce((p->>'localLegado')::boolean,false) or body->>'local'=p->>'local') and inscritos<=(p->>'vagas')::integer;
  if not found then return '{"conflict":"Confira a oficina e mantenha vagas suficientes para os inscritos."}'; end if;
 when 'admin/editar-noticia' then
  update portal.items set body=body || (p-'id') where id=p->>'id' and kind='noticia';
  if not found then return '{"conflict":"A notícia não está mais disponível."}'; end if;
 when 'admin/excluir-noticia' then
  delete from portal.items where id=p->>'id' and kind='noticia';
  if not found then return '{"conflict":"A notícia já foi excluída."}'; end if;
 when 'admin/moderar' then
  update portal.items set status=p->>'status' where id=p->>'id' and kind in ('noticia','oficina') and status='pendente';
  if not found then return '{"conflict":"Esta proposta já foi avaliada."}'; end if;
 when 'admin/apagar' then
  delete from portal.items where id=p->>'id' and kind='acao';
  if not found then return '{"conflict":"A ação já foi removida."}'; end if;
 else raise exception 'Operação desconhecida';
 end case;
 return '{"ok":true}';
exception when unique_violation then
 -- O PostgreSQL desfaz também o incremento de inscritos deste bloco.
 return '{"conflict":"Já existe uma inscrição com este e-mail."}';
end;
$$;
revoke all on function public.portal_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.portal_api(text,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
