begin;
create schema if not exists portal;
revoke all on schema portal from public,anon,authenticated;
create table if not exists portal.items (
 id text primary key, kind text not null check(kind in ('noticia','acao','oficina','ideia')),
 status text not null check(status in ('pendente','aprovada','arquivada')),
 body jsonb not null, inscritos integer not null default 0 check(inscritos >= 0),
 created timestamptz not null default now()
);
create table if not exists portal.registrations (
 workshop text not null references portal.items(id), email text not null,
 nome text not null, cargo text not null, area text not null, primary key(workshop,email)
);
create table if not exists portal.seeds (id text primary key);

-- Apenas o serviço no Render pode executar esta função. As tabelas ficam em schema privado.
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
  update portal.items set body=p-'id' where id=p->>'id' and kind='oficina' and inscritos<=(p->>'vagas')::integer;
  if not found then return '{"conflict":"Confira a oficina e mantenha vagas suficientes para os inscritos."}'; end if;
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
with first_run as (insert into portal.seeds values ('acoes-v1') on conflict do nothing returning id)
insert into portal.items (id,kind,status,body,created)
select 'acao-original-'||n,'acao','aprovada',b,timestamptz '2026-01-01 00:00:00+00' - n * interval '1 second' from first_run,
jsonb_array_elements($acoes$[
 {
  "titulo": "Ouvir, Agir e Transformar",
  "descricao": "Canais de escuta ativa para captar necessidades e ideias de toda a comunidade Senac Salto."
 },
 {
  "titulo": "Mural de Notícias",
  "descricao": "Vitrine das ações realizadas pelas turmas, publicadas em formato de portal de notícias."
 },
 {
  "titulo": "Senac Troca de Saberes",
  "descricao": "Oficinas rápidas entre docentes e funcionários para compartilhar conhecimento prático."
 },
 {
  "titulo": "Experimentar, Compartilhar e Transformar",
  "descricao": "Espaço para testar novos formatos de aula e experiências imersivas."
 },
 {
  "titulo": "Produzir, Comunicar, Aprender",
  "descricao": "Produção de conteúdo multimodal e portfólios digitais dos cursos."
 },
 {
  "titulo": "Docência com Tecnologias Emergentes",
  "descricao": "Formação avançada em metodologias ativas e ferramentas digitais para docentes."
 },
 {
  "titulo": "Clube de Inovação Docente",
  "descricao": "Comunidade de prática entre professores da unidade para troca de experiências."
 },
 {
  "titulo": "Programa de Embaixadores",
  "descricao": "Projetos que conectam os cursos do Senac Salto com demandas reais da cidade."
 },
 {
  "titulo": "Vitrine de Soluções",
  "descricao": "Repositório de projetos de sucesso para replicação em outras turmas."
 },
 {
  "titulo": "Café com Comitê",
  "descricao": "Encontros presenciais informais para escuta ativa e humanizada."
 },
 {
  "titulo": "Espaço Maker",
  "descricao": "Apoio ao desenvolvimento de soluções e empreendedorismo estudantil."
 },
 {
  "titulo": "Ideação Rápida",
  "descricao": "Apoio direto a docentes no uso de metodologias ativas e ferramentas de IA."
 },
 {
  "titulo": "Diálogo com o Mercado",
  "descricao": "Encontros com empresas da região para alinhar a oferta educacional."
 },
 {
  "titulo": "Reconhecimento à Inovação",
  "descricao": "Programa de reconhecimento para inovadores da comunidade Senac Salto."
 }
]$acoes$::jsonb) with ordinality as a(b,n);
notify pgrst, 'reload schema';
commit;
