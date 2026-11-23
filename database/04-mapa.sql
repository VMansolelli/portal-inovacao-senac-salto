begin;
create schema if not exists mapa;
revoke all on schema mapa from public,anon,authenticated;
create table if not exists mapa.entidade(
 id uuid primary key default gen_random_uuid(), tipo text not null check(tipo in ('sala','curso','turma','docente')),
 nome text not null check(length(trim(nome)) between 1 and 160), ativo boolean not null default true,
 capacidade int check(capacidade between 1 and 10000), curso uuid references mapa.entidade(id),
 pin_hash text unique, unique(tipo,nome));
create table if not exists mapa.config(id boolean primary key default true check(id),pin_hash text);
create table if not exists mapa.falhas_pin(origem text primary key, erros integer not null, expira timestamptz not null);
create table if not exists mapa.recesso(dia date primary key,motivo text not null);
create table if not exists mapa.reserva(
 id uuid primary key default gen_random_uuid(),serie uuid not null, tipo text not null check(tipo in ('aula','reuniao')),
 dia date not null,inicio time not null,fim time not null check(fim>inicio), sala uuid not null references mapa.entidade(id),
 turma uuid references mapa.entidade(id), docentes uuid[] not null, titulo text not null, cancelada boolean not null default false);
create index if not exists reserva_dia on mapa.reserva(dia,sala) where not cancelada;
create index if not exists reserva_serie on mapa.reserva(serie,dia);
create table if not exists mapa.chave(
 id uuid primary key default gen_random_uuid(),sala uuid not null references mapa.entidade(id),reserva uuid references mapa.reserva(id),
 permitidos uuid[] not null, retirante text not null, retirada timestamptz not null default now(), devolvente text,devolucao timestamptz,nota text);
create unique index if not exists chave_unica on mapa.chave(sala) where devolucao is null;
create table if not exists mapa.acessos (like portal.requests including all);
create table if not exists mapa.instalacao(id boolean primary key);
with primeira as (insert into mapa.instalacao values(true) on conflict do nothing returning id)
insert into mapa.entidade(tipo,nome,capacidade) select 'sala',s.n,s.c from primeira cross join (values
('Sala 1',29),('Sala 2',15),('Sala 3',24),('Lab Digital 4',35),('Lab Software 5',38),('Sala 6',29),('Sala 7',29),
('Lab Software 8',38),('Lab Hardware 9',24),('Sala 10',29),('Sala 11',29),('Lab Gastronomia 12',20),('Lab Bar 13',18),
('Lab Bem Estar 14',20),('Sala 15',29),('Sala 16',29),('Lab Beleza 17',32),('Auditório',128),('Biblioteca',48)) s(n,c);
create or replace view mapa.quadro as
 select r.*,s.nome as sala_nome,t.nome as turma_nome,c.nome as curso_nome,
 coalesce((select string_agg(d.nome,', ' order by i.n) from unnest(r.docentes) with ordinality i(id,n) join mapa.entidade d on d.id=i.id),'') as professores
 from mapa.reserva r join mapa.entidade s on s.id=r.sala left join mapa.entidade t on t.id=r.turma left join mapa.entidade c on c.id=t.curso where not r.cancelada;

create or replace function public.mapa_api(op text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 eid uuid; rid uuid; sid uuid; tid uuid; ids uuid[]; teachers uuid[]; target mapa.reserva; lease mapa.chave;
 d date; ini time; term time; t text; who text; msg text; pinid uuid; override_pin boolean; result jsonb;
 hoje date:=(now() at time zone 'America/Sao_Paulo')::date; countrows int:=0; sk int:=0;
begin
 if op not in ('salas','catalogo','dia','historico','recessos','autorizado','master/lista','validar-convite') then
   perform pg_advisory_xact_lock(830174321);
 end if;
 case op
 when 'solicitar' then
  insert into mapa.acessos(email,nome) values(lower(p->>'email'),p->>'nome') on conflict(email) do nothing;
 when 'master/lista' then
  select coalesce(jsonb_agg(to_jsonb(r)-'digest'-'expires' order by created desc),'[]'::jsonb)
    into result from mapa.acessos r;return result;
 when 'master/aprovar','master/rejeitar' then
  update mapa.acessos set estado=case when op='master/aprovar' then 'aguarda ativação' else 'rejeitada' end,
    digest=p->>'digest',expires=now()+interval '24 hours'
    where id=(p->>'id')::uuid and estado in ('pendente','aguarda ativação','rejeitada');
  if not found then return '{"conflict":"Solicitação indisponível."}'; end if;
 when 'validar-convite' then
  return to_jsonb(exists(select 1 from mapa.acessos where email=p->>'email' and digest=p->>'digest'
    and expires>now() and estado='aguarda ativação'));
 when 'ativar' then
  update mapa.acessos set estado='ativa',digest=null,expires=null,uid=(p->>'uid')::uuid
    where email=p->>'email' and digest=p->>'digest' and expires>now() and estado='aguarda ativação'
    and exists(select 1 from auth.users u where u.id=(p->>'uid')::uuid and lower(u.email)=p->>'email' and u.email_confirmed_at is not null);
  if not found then return '{"conflict":"Solicite um novo convite ao responsável."}'; end if;
 when 'autorizado' then
  return to_jsonb(exists(select 1 from mapa.acessos where uid=(p->>'uid')::uuid and estado='ativa'));
 when 'salas' then return (select coalesce(jsonb_agg(jsonb_build_array(nome,capacidade) order by nome),'[]') from mapa.entidade where tipo='sala' and ativo);
 when 'catalogo' then return (select coalesce(jsonb_agg(to_jsonb(e)-'pin_hash' order by nome),'[]') from mapa.entidade e);
 when 'recessos' then return (select coalesce(jsonb_agg(to_jsonb(x) order by dia),'[]') from mapa.recesso x);
 when 'historico' then return (select coalesce(jsonb_agg(to_jsonb(x) order by retirada desc),'[]') from
   (select k.id,k.retirada,k.devolucao,k.retirante,k.devolvente,k.nota,s.nome as sala from mapa.chave k join mapa.entidade s on s.id=k.sala
    where (k.retirada at time zone 'America/Sao_Paulo')::date=(p->>'data')::date or (k.devolucao at time zone 'America/Sao_Paulo')::date=(p->>'data')::date or k.devolucao is null) x);
 when 'pin-dia','retirar','devolver','dia' then
  if op<>'dia' then
   delete from mapa.falhas_pin where expira<=now();
   if exists(select 1 from mapa.falhas_pin where (origem=coalesce(p->>'origem','local') and erros>=5) or (origem='global' and erros>=30)) then
     return '{"limited":"Muitas tentativas. Aguarde até 15 minutos e tente novamente."}';
   end if;
   select id,nome into pinid,who from mapa.entidade where tipo='docente' and ativo and pin_hash=p->>'hash';
   override_pin:=exists(select 1 from mapa.config where pin_hash=p->>'hash');
   if override_pin then who:='PIN administrativo'; end if;
   if who is null then
    insert into mapa.falhas_pin as f(origem,erros,expira)
    values(coalesce(p->>'origem','local'),1,now()+interval '15 minutes'),('global',1,now()+interval '15 minutes')
    on conflict(origem) do update set erros=f.erros+1;
    return '{"denied":"PIN inválido ou desativado."}';end if;
  end if;
  if op in ('dia','pin-dia') then
    d:=(p->>'data')::date;
    return jsonb_build_object('hoje',hoje,'adminPin',coalesce(override_pin,false),
    'recessos',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from mapa.recesso x where dia between d and d+6),
    'salas',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'nome',s.nome,'ocupada',k.id is not null,'movimento',k.id,
      'podeDevolver',coalesce(override_pin or pinid=any(k.permitidos),false)) order by s.nome),'[]') from mapa.entidade s
      left join mapa.chave k on k.sala=s.id and k.devolucao is null where s.tipo='sala' and (s.ativo or k.id is not null)),
    'reservas',(select coalesce(jsonb_agg(to_jsonb(q)||jsonb_build_object('podeRetirar',coalesce(override_pin or pinid=any(q.docentes),false) and q.dia=hoje) order by q.dia,q.inicio,q.sala_nome),'[]')
     from mapa.quadro q where q.dia between d and d+case when (p->>'semana')::boolean then 6 else 0 end));
  end if;
  if override_pin then
    if length(trim(coalesce(p->>'responsavel',''))) not between 1 and 160 then raise exception 'Informe o responsável pelo movimento.';end if;
    who:='PIN administrativo · '||trim(p->>'responsavel');
  end if;
  sid:=(p->>'sala')::uuid;
  if op='retirar' then
    if not exists(select 1 from mapa.entidade where id=sid and ativo and tipo='sala') then raise exception 'Sala indisponível.';end if;
    select * into target from mapa.reserva where id=nullif(p->>'reserva','')::uuid and dia=hoje and sala=sid and not cancelada;
    if (not found and (not override_pin or nullif(p->>'reserva','') is not null)) or (not override_pin and not(pinid=any(target.docentes))) then raise exception 'Escolha uma reserva sua de hoje.';end if;
    if exists(select 1 from mapa.chave where sala=sid and devolucao is null) then raise exception 'Chave já retirada.';end if;
    insert into mapa.chave(sala,reserva,permitidos,retirante) values(sid,target.id,coalesce(target.docentes,'{}'),who);
  else
    select * into lease from mapa.chave where sala=sid and devolucao is null;
    if not found or lease.id is distinct from (p->>'movimento')::uuid or not(override_pin or pinid=any(lease.permitidos)) then raise exception 'Devolução indisponível para este PIN.';end if;
    update mapa.chave set devolucao=now(),devolvente=who where id=lease.id;
  end if;
 when 'corrigir' then
  if length(trim(coalesce(p->>'motivo','')))<4 then raise exception 'Informe a justificativa.';end if;
  update mapa.chave set devolucao=now(),devolvente=p->>'operador',nota=left(p->>'motivo',500) where id=(p->>'id')::uuid and devolucao is null;
  if not found then raise exception 'Movimento já encerrado.';end if;
 when 'cadastro' then
  eid:=nullif(p->>'id','')::uuid;t:=p->>'tipo';
  if t='turma' and not exists(select 1 from mapa.entidade where id=(p->>'curso')::uuid and tipo='curso' and ativo) then raise exception 'Selecione um curso ativo.';end if;
  if t='sala' and nullif(p->>'capacidade','') is null then raise exception 'Informe a capacidade.';end if;
  if eid is null then
   insert into mapa.entidade(tipo,nome,capacidade,curso) values(t,trim(p->>'nome'),nullif(p->>'capacidade','')::int,nullif(p->>'curso','')::uuid);
  else
   update mapa.entidade set nome=trim(p->>'nome'),capacidade=nullif(p->>'capacidade','')::int,curso=nullif(p->>'curso','')::uuid where id=eid and tipo=t;
   if not found then raise exception 'Cadastro indisponível.';end if;
  end if;
 when 'desativar' then
  eid:=(p->>'id')::uuid;
  if exists(select 1 from mapa.quadro q where dia>=hoje and (sala=eid or turma=eid or eid=any(docentes))) or
    exists(select 1 from mapa.chave where devolucao is null and (sala=eid or eid=any(permitidos))) or
    exists(select 1 from mapa.entidade where curso=eid and ativo) then raise exception 'Há vínculos ativos. Realoque as reservas, turmas ou chaves antes de desativar.';end if;
  update mapa.entidade set ativo=false,pin_hash=null where id=eid;
 when 'reativar' then
  eid:=(p->>'id')::uuid;
  if exists(select 1 from mapa.entidade turma join mapa.entidade curso on curso.id=turma.curso
      where turma.id=eid and turma.tipo='turma' and not curso.ativo) then
    raise exception 'Reative o curso antes de reativar a turma.';
  end if;
  update mapa.entidade set ativo=true where id=eid;
  if not found then raise exception 'Cadastro indisponível.';end if;
 when 'pin' then
  if exists(select 1 from mapa.entidade where pin_hash=p->>'hash') or exists(select 1 from mapa.config where pin_hash=p->>'hash') then raise exception 'Gere o PIN novamente.';end if;
  if p->>'id'='admin' then insert into mapa.config values(true,p->>'hash') on conflict(id) do update set pin_hash=excluded.pin_hash;
  else update mapa.entidade set pin_hash=p->>'hash' where id=(p->>'id')::uuid and tipo='docente' and ativo;
    if not found then raise exception 'Docente indisponível.';end if;
  end if;
 when 'recesso' then
  d:=(p->>'data')::date;
  if exists(select 1 from mapa.quadro where dia=d and tipo='aula') then raise exception 'Já há aulas nesse dia. Realoque ou cancele antes de registrar o recesso.';end if;
  insert into mapa.recesso values(d,left(p->>'motivo',160)) on conflict(dia) do update set motivo=excluded.motivo;
 when 'remover-recesso' then delete from mapa.recesso where dia=(p->>'data')::date;
 when 'criar','alterar','cancelar' then
  if op<>'criar' then
    select * into target from mapa.reserva where id=(p->>'id')::uuid and not cancelada;
    if not found or coalesce(p->>'escopo','') not in ('uma','proximas','serie') then raise exception 'Reserva ou alcance inválido.';end if;
    select array_agg(id) into ids from mapa.reserva where not cancelada and serie=target.serie and
      ((p->>'escopo')='serie' or (p->>'escopo'='proximas' and dia>=target.dia) or id=target.id);
    if exists(select 1 from mapa.chave where reserva=any(ids)) then raise exception 'O conjunto inclui retirada registrada. Selecione apenas ocorrências sem movimentação.';end if;
    if op='alterar' and p->>'escopo'<>'uma' and p->>'tipo'<>target.tipo then raise exception 'Altere o tipo de uma ocorrência por vez.';end if;
    if op='cancelar' then update mapa.reserva set cancelada=true where id=any(ids);return '{"ok":true}';end if;
  end if;
  sid:=(p->>'sala')::uuid;tid:=nullif(p->>'turma','')::uuid;ini:=(p->>'inicio')::time;term:=(p->>'fim')::time;
  select coalesce(array_agg(x::uuid),'{}') into teachers from jsonb_array_elements_text(p->'docentes') x;
  if not exists(select 1 from mapa.entidade where id=sid and tipo='sala' and ativo) or
     exists(select 1 from unnest(teachers) u where not exists(select 1 from mapa.entidade where id=u and tipo='docente' and ativo)) or
     ((p->>'tipo')='aula' and not exists(select 1 from mapa.entidade where id=tid and tipo='turma' and ativo)) then raise exception 'Confira os cadastros ativos.';end if;
  if op='alterar' and (p->>'escopo')<>'uma' and target.dia<>(p->'datas'->>0)::date then raise exception 'Para mover a data, edite apenas uma ocorrência.';end if;
  if op='alterar' then
    update mapa.reserva set cancelada=true where id=any(ids);
  end if;
  rid:=gen_random_uuid();
  for eid,d in select null::uuid,value::date from jsonb_array_elements_text(p->'datas') where op='criar'
    union all select r.id,case when p->>'escopo'='uma' then (p->'datas'->>0)::date else r.dia end from mapa.reserva r where op='alterar' and r.id=any(ids)
  loop
    if p->>'tipo'='aula' and (extract(isodow from d)=7 or (extract(isodow from d)=6 and (ini<time '08:00' or term>time '12:00')) or exists(select 1 from mapa.recesso where dia=d)) then
      if op='alterar' then raise exception 'Data ou turno incompatível com o calendário letivo.';end if;
      sk:=sk+1;continue;
    end if;
    select concat(sala_nome,' · ',to_char(dia,'DD/MM/YYYY'),' · ',inicio,'–',fim,' · ',coalesce(turma_nome,titulo)) into msg from mapa.quadro
     where dia=d and sala=sid and inicio<term and fim>ini limit 1;
    if found then raise exception 'Sala já reservada: %',msg;end if;
    if not coalesce((p->>'aceitarAviso')::boolean,false) and exists(select 1 from mapa.quadro where dia=d and inicio<term and fim>ini and (docentes && teachers or turma=tid)) then
      raise exception 'AVISO: docente ou turma com outra reserva em %. Confirme para continuar.',to_char(d,'DD/MM/YYYY');
    end if;
    if op='criar' then
      insert into mapa.reserva(serie,tipo,dia,inicio,fim,sala,turma,docentes,titulo) values(rid,p->>'tipo',d,ini,term,sid,tid,teachers,p->>'titulo');
    else
      update mapa.reserva set cancelada=false,tipo=p->>'tipo',dia=d,inicio=ini,fim=term,sala=sid,turma=tid,docentes=teachers,titulo=p->>'titulo' where id=eid;
    end if;
    countrows:=countrows+1;
  end loop;
  if countrows=0 then raise exception 'Nenhuma ocorrência disponível no calendário.';end if;
  return jsonb_build_object('quantidade',countrows,'recessos',sk);
 else raise exception 'Operação desconhecida.';
 end case;
 return '{"ok":true}';
exception when raise_exception then return jsonb_build_object('conflict',sqlerrm);
when unique_violation then return '{"conflict":"Este cadastro ou movimento já existe."}';
when check_violation or invalid_text_representation or not_null_violation then return '{"conflict":"Confira os valores informados."}';
end;
$$;
revoke all on function public.mapa_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.mapa_api(text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
