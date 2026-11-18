begin;
create table if not exists portal.requests (
 id uuid primary key default gen_random_uuid(), email text unique not null, nome text not null,
 estado text not null default 'pendente', uid uuid unique references auth.users(id) on delete cascade,
 digest text, expires timestamptz, created timestamptz not null default now()
);
create table if not exists portal.backups (
 uid uuid primary key references auth.users(id) on delete cascade, digest text unique not null
);
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
 when 'admin/editar-acao' then
  update portal.items set body=body || (p-'id') where id=p->>'id' and kind='acao';
  if not found then return '{"conflict":"Ação indisponível."}'; end if;
 when 'admin/excluir-oficina' then
  perform 1 from portal.items where id=p->>'id' and kind='oficina' for update;
  if not found then return '{"conflict":"Oficina indisponível."}'; end if;
  delete from portal.registrations where workshop=p->>'id';
  delete from portal.items where id=p->>'id' and kind='oficina';
 when 'admin/apagar-ideia' then
  delete from portal.items where id=p->>'id' and kind='ideia';
  if not found then return '{"conflict":"Ideia indisponível."}'; end if;
 when 'admin/arquivar-ideia','admin/arquivar-noticia' then
  update portal.items set status='arquivada' where id=p->>'id' and
   ((op='admin/arquivar-ideia' and kind='ideia' and status='pendente') or
    (op='admin/arquivar-noticia' and kind='noticia' and status='aprovada'));
  if not found then return '{"conflict":"Registro indisponível para arquivamento."}'; end if;
 when 'solicitar' then
  insert into portal.requests(email,nome) values(lower(p->>'email'),p->>'nome') on conflict(email) do nothing;
 when 'master/lista' then
  select coalesce(jsonb_agg(to_jsonb(r)-'digest'-'expires' order by created desc),'[]'::jsonb)
    into result from portal.requests r;return result;
 when 'master/aprovar','master/rejeitar' then
  update portal.requests set estado=case when op='master/aprovar' then 'aguarda ativação' else 'rejeitada' end,
    digest=p->>'digest',expires=now()+interval '24 hours'
    where id=(p->>'id')::uuid and estado in ('pendente','aguarda ativação','rejeitada');
  if not found then return '{"conflict":"Solicitação indisponível."}'; end if;
 when 'validar-convite' then
  return to_jsonb(exists(select 1 from portal.requests where email=p->>'email' and digest=p->>'digest'
    and expires>now() and estado='aguarda ativação'));
 when 'ativar' then
  update portal.requests set estado='ativa',digest=null,expires=null,uid=(p->>'uid')::uuid
    where email=p->>'email' and digest=p->>'digest' and expires>now() and estado='aguarda ativação'
    and exists(select 1 from auth.users u where u.id=(p->>'uid')::uuid and lower(u.email)=p->>'email' and u.email_confirmed_at is not null);
  if not found then return '{"conflict":"Solicite um novo convite ao responsável."}'; end if;
 when 'autorizado' then
  return to_jsonb(exists(select 1 from portal.requests where uid=(p->>'uid')::uuid and estado='ativa'));
 when 'guardar-reserva' then
  insert into portal.backups(uid,digest) values((p->>'uid')::uuid,p->>'digest')
   on conflict(uid) do update set digest=excluded.digest;
 when 'usar-reserva' then
  delete from portal.backups b using auth.users u where u.id=b.uid and lower(u.email)=p->>'email'
    and b.digest=p->>'digest' returning to_jsonb(b.uid) into result;return result;
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
