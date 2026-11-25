begin;
alter table portal.requests add column if not exists area text not null default 'inovacao' check(area in ('inovacao','totem','ambas'));
create or replace function public.portal_areas_api(op text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare resultado jsonb;
begin
 if op='perfil' then
   select to_jsonb(area) into resultado from portal.requests where uid=(p->>'uid')::uuid and estado='ativa';
   return resultado;
 elsif op='solicitar' then
   insert into portal.requests(nome,email,area) values(p->>'nome',lower(p->>'email'),p->>'area') on conflict(email) do nothing;
 elsif op='master/aprovar' then
   resultado:=public.portal_api(op,p);
   if resultado ? 'conflict' then return resultado;end if;
   update portal.requests set area=p->>'area' where id=(p->>'id')::uuid;
 elsif op='master/area' then
   update portal.requests set area=p->>'area' where id=(p->>'id')::uuid and estado='ativa';
   if not found then return '{"conflict":"Conta ativa não encontrada."}';end if;
 elsif op='moderar' then
   update portal.items set status=p->>'status' where id=p->>'id' and kind=p->>'kind' and status='pendente';
   if not found then return '{"conflict":"Item indisponível nesta área."}';end if;
 elsif op='foto' then
   select body->'imagem' into resultado from portal.items where id=p->>'id' and
   (status='aprovada' or p->>'area'='ambas' or (p->>'area'='totem' and kind='noticia') or (p->>'area'='inovacao' and kind<>'noticia'));
   return resultado;
 else raise exception 'Operação desconhecida';end if;
 return '{"ok":true}';
end $$;
revoke all on function public.portal_areas_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.portal_areas_api(text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
