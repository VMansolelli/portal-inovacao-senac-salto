import {randomBytes,createHash} from 'node:crypto';
import {today,day} from './mapa.js';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {fields,workshop,photo,insist} from './validation.js';

export function createPortal(config, remote = fetch) {
  const origin = new URL(config.FRONTEND_ORIGIN).origin;
  const base = new URL(config.SUPABASE_URL);
  const adminIds = new Set([config.ADMIN_USER_ID, config.ADMIN_USER_IDS].filter(Boolean).join(',').split(',').map(id=>id.trim()).filter(Boolean));
  const masterId=config.ADMIN_USER_ID?.trim();
  const authorized=async user=>!!user?.email_confirmed_at && (adminIds.has(user.id) || await rpc('autorizado',{uid:user.id})===true);
  const areasRpc=(op,p)=>rpc(op,p,'portal_areas_api');
  async function areaConta(user){
    if(!user?.email_confirmed_at)return null;
    if(user.id===masterId)return 'ambas';
    return await areasRpc('perfil',{uid:user.id}) || (adminIds.has(user.id)?'inovacao':null);
  }
  function escolherArea(area){
    insist(['inovacao','totem','ambas'].includes(area),'Selecione uma área válida.');
    return area;
  }
  const digest=value=>createHash('sha256').update(value).digest('hex');
  const newCode=()=>randomBytes(24).toString('base64url');
  async function authAdmin(path,method,body){
    return remote(new URL('/auth/v1/admin/users'+path,base),{method,signal:AbortSignal.timeout(15000),
      headers:{apikey:config.SUPABASE_SECRET_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
  }
  if (!adminIds.size || !config.SUPABASE_SECRET_KEY || !config.SUPABASE_PUBLISHABLE_KEY || base.protocol!=='https:') {
    throw Error('Configure as variáveis do Supabase e o identificador do administrador.');
  }
  const secure = origin.startsWith('https://');
  const cookieName = secure ? '__Host-portal' : 'portal_local';
  function sessionCookie(token, seconds) {
    return cookieName+'='+token+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+seconds+(secure?'; Secure':'');
  }
  async function auth(path,opts={}) {
    return remote(new URL('/auth/v1/'+path,base),{...opts,signal:AbortSignal.timeout(15000),
      headers:{apikey:config.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json',...opts.headers}});
  }
  const pinAttempts=new Map();
  function limitarMovimentos(req){
    // Bucket per network source, with a global ceiling for this process.
    const source=req.headers['x-forwarded-for']?.split(',').at(-1)?.trim()||req.socket?.remoteAddress||'local';
    const minute=Math.floor(Date.now()/60000);
    for(const [k,v] of pinAttempts)if(v.minute!==minute)pinAttempts.delete(k);
    for(const [key,limit] of [['all',600],['ip:'+source,100]]){
      const attempts=(pinAttempts.get(key)?.attempts||0)+1;
      pinAttempts.set(key,{attempts,minute});
      insist(attempts<=limit,'Aguarde um minuto antes de tentar novamente.',429);
    }
    return digest(source);
  }
  const mapRpc=(op,p)=>rpc(op,p,'mapa_api');
  const mapAllowed=async u=>!!u?.email_confirmed_at && (u.id===masterId || await mapRpc('autorizado',{uid:u.id})===true);
  async function rpc(op,p={},func='portal_api') {
    const r=await remote(new URL('/rest/v1/rpc/'+func,base),{method:'POST',signal:AbortSignal.timeout(20000),
      headers:{apikey:config.SUPABASE_SECRET_KEY,'Content-Type':'application/json'},body:JSON.stringify({op,p})});
    insist(r.ok,'Não foi possível consultar o banco de dados.',503);
    const result=await r.json();
    insist(!result?.limited,result?.limited,429);
    insist(!result?.denied,result?.denied,403);
    insist(!result?.conflict,result?.conflict,409);
    return result;
  }
  async function verifiedUser(token) {
    if(!token)return false;
    const r=await auth('user',{headers:{Authorization:'Bearer '+token}});
    if(r.status>=500)throw Object.assign(new Error('Serviço de login indisponível.'),{status:503});
    if(!r.ok)return false;
    const u=await r.json();
    return u;
  }
  const admin=async token=>authorized(await verifiedUser(token));
  async function read(req) {
    insist(req.headers['content-type']?.split(';')[0]==='application/json','Envie dados em JSON.',415);
    let size=0; const parts=[];
    for await(const part of req){size+=part.length;insist(size<=680000,'Envio muito grande.',413);parts.push(part);}
    let obj;try{obj=JSON.parse(Buffer.concat(parts).toString());}catch{}
    insist(obj && typeof obj==='object' && !Array.isArray(obj),'Dados inválidos.');
    return obj;
  }
  return http.createServer(async(req,res)=>{
    function reply(status,data){
      res.writeHead(status,{'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));
    }
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    try{
      const path=new URL(req.url,'http://localhost').pathname;
      if(req.method==='GET' && path==='/health')return reply(200,{ok:true});
      if(req.method==='GET' && path==='/api/recuperar')return reply(200,{modo:'link'});
      insist(path.startsWith('/api/'),'Página não encontrada.',404);
      const op=path.slice(5);
      const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
      if(req.method==='POST')insist(!req.headers.origin || req.headers.origin===origin,'Origem inválida.',403);
      let staff;
      if(op.startsWith('admin/') || op.startsWith('master/')){
        staff=await verifiedUser(token);
        const area=await areaConta(staff);
        insist(area,'Entre com a conta administrativa.',403);
        if(op.startsWith('admin/')&&!['admin/perfil','admin/reserva'].includes(op)){
          const exigida=(op==='admin/totem'||op.startsWith('admin/totem/')||['admin/noticias','admin/moderar-noticia','admin/editar-noticia','admin/excluir-noticia','admin/arquivar-noticia'].includes(op))?'totem':'inovacao';
          insist(area==='ambas'||area===exigida,'Sua conta não tem acesso a esta área.',403);
        }
        if(op.startsWith('master/'))insist(staff.id===masterId,'Acesso exclusivo do administrador principal.',403);
      }
      const mapRequest=op.startsWith('mapa/');
      const action=mapRequest?op.slice(5):op;
      const accessRpc=mapRequest?mapRpc:rpc;
      if(mapRequest && !['entrar','solicitar','ativar','balcao','pegar','entregar'].includes(action)){
        staff=await verifiedUser(token);insist(await mapAllowed(staff),'Entre com uma conta autorizada para o Apoio.',403);
        if(action.startsWith('master/'))insist(staff.id===masterId,'Exclusivo de Victor.',403);
      }
      if(mapRequest && !['balcao','pegar','entregar','relatorio','excel-consultar','excel-publicar','perfil','entrar','ativar','solicitar','master/lista','master/aprovar','master/rejeitar'].includes(action))
        return reply(410,{erro:'O Apoio agora utiliza o mapa publicado pelo Excel.'});
      if(req.method==='GET'){
        if(['totem','admin/totem'].includes(op)){
          const info=await rpc(op==='totem'?'tela':'editor',{},'totem_api');
          for(const a of info.avisos)if(a.arquivo)a.video=new URL('/storage/v1/object/public/totem-videos/'+encodeURIComponent(a.arquivo),base).href;
          return reply(200,info);
        }
        if(op==='mapa/perfil')return reply(200,{master:staff.id===masterId,hoje:today()});
        if(mapRequest && action==='master/lista')return reply(200,await mapRpc(action,{}));
        if(op==='totem/versao')return reply(200,{versao:'midias-3',reelPorLink:false});
        if(op==='versao')return reply(200,{versao:'painel-3',recuperacao:'link e chave de reserva',mapa:'mapa-1',salas:(await mapRpc('salas',{})).length});
        if(op==='admin/perfil')return reply(200,{master:staff.id===masterId});
        if(op==='master/lista')return reply(200,await rpc(op));
        if(op==='salas')return reply(200,await mapRpc('salas',{}));
        if(op==='publico')return reply(200,await rpc(op));
        if(['admin/lista','admin/noticias'].includes(op)){
          const noticias=op==='admin/noticias';
          return reply(200,(await rpc('admin/lista')).filter(item=>(item.kind==='noticia')===noticias));
        }
        if(op.startsWith('admin/inscritos/'))return reply(200,await rpc('admin/inscritos',{id:op.slice(16)}));
        if(op.startsWith('foto/')){
          const area=token?await areaConta(await verifiedUser(token)):null;
          const src=area?await areasRpc('foto',{area,id:op.slice(5)}):await rpc('foto',{id:op.slice(5)});
          insist(src,'Foto não encontrada.',404);
          res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private, no-store'});return res.end(Buffer.from(src.split(',')[1],'base64'));
        }
      }
      insist(req.method==='POST','Página não encontrada.',404);
      const b=await read(req);
      if(op==='totem/inscrever')return reply(201,await rpc('inscrever',fields(b,['nome','email','workshop'],['cargo','area']),'totem_api'));
      if(op.startsWith('admin/totem/')){
        const acao=op.slice('admin/totem/'.length);
        if(acao==='upload'){
          const ext={'video/mp4':'mp4','video/webm':'webm','image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[b.mime];
          insist(typeof ext==='string' && Number.isInteger(b.bytes)&&b.bytes>0&&b.bytes<=(b.mime.startsWith('image/')?8388608:50331648),'Use JPG, PNG ou WebP de até 8 MB, ou vídeo de até 48 MB.');
          const arquivo=randomBytes(16).toString('hex')+'.'+ext;
          const path='/object/upload/sign/totem-videos/'+arquivo;
          const response=await remote(new URL('/storage/v1'+path,base),{method:'POST',headers:{apikey:config.SUPABASE_SECRET_KEY,Authorization:'Bearer '+config.SUPABASE_SECRET_KEY,'Content-Type':'application/json'},body:'{}'});
          insist(response.ok,'Falha ao preparar o envio do vídeo.',503);
          const {url}=await response.json();
          const signed=new URL(url,base);
          insist(signed.searchParams.has('token'),'Falha ao autorizar envio.',503);
          return reply(200,{arquivo,publica:new URL('/storage/v1/object/public/totem-videos/'+arquivo,base).href,url:new URL('/storage/v1'+path+signed.search,base).href});
        }
        function linkOpcional(campo){
          if(b[campo]===undefined)return undefined;
          const valor=b[campo];
          if(valor==='')return '';
          insist(typeof valor==='string'&&valor.length<=1024&&URL.canParse(valor),'Confira o link informado.');
          const url=new URL(valor);
          insist(url.protocol==='https:'&&!url.username&&!url.password&&url.href.length<=1024,'Use um link HTTPS.');
          return url.href;
        }
        let d;
        if(acao==='aviso'){
          d=fields(b,['tipo','titulo','inicio','fim'],['id','descricao','arquivo']);
          insist(['Curso','Ação','Vídeo','Reel'].includes(d.tipo),'Selecione um tipo de divulgação válido.');
          insist(day(d.inicio)<=day(d.fim),'A data final deve ser igual ou posterior à data inicial.');
          d.imagem_curso=d.tipo==='Curso'?linkOpcional('imagem_curso'):'';
          d.instagram_reel=d.tipo==='Reel'?linkOpcional('instagram_reel'):'';
          if(d.instagram_reel){
            const url=new URL(d.instagram_reel);
            const match=url.pathname.match(/^\/reel\/([A-Za-z0-9_-]+)\/?$/);
            insist(['instagram.com','www.instagram.com'].includes(url.hostname)&&!url.port&&match,'Informe o link de um Reel público do Instagram.');
            d.instagram_reel='https://www.instagram.com/reel/'+match[1]+'/';
          }
          d.inscricao_url=d.tipo==='Curso'?linkOpcional('inscricao_url'):'';
          d.legenda=d.tipo==='Vídeo'?String(b.legenda||''):'';
          insist(!d.legenda||(d.legenda.length<=60000&&d.legenda.startsWith('WEBVTT')),'Use legenda WebVTT de até 60 mil caracteres.');
          if(d.tipo==='Reel')insist(d.arquivo,'Anexe o vídeo do Reel para reproduzir no totem.');
          if(d.tipo==='Curso' && b.segundos!==undefined){d.segundos=Number(b.segundos);insist(Number.isInteger(d.segundos)&&d.segundos>=1&&d.segundos<=3600,'Informe entre 1 e 3600 segundos.');}
          if(d.tipo==='Curso')insist(d.imagem_curso,'Anexe a imagem do curso ou informe o endereço dela.');
          if(d.tipo==='Vídeo'||(d.tipo==='Reel'&&d.arquivo))insist(/^[a-f0-9]{32}[.](mp4|webm)$/.test(d.arquivo),'Anexe o vídeo.');else d.arquivo=null;
        }else if(acao==='visibilidade'){d=fields(b,['id']);insist(typeof b.oculto==='boolean','Visibilidade inválida.');d.oculto=b.oculto;}
        else if(acao==='excluir')d=fields(b,['id']);
        else if(acao==='horarios'){
          d={avaliacao:linkOpcional('avaliacao'),arte_reserva:linkOpcional('arte_reserva')};
          if(b.noticia_segundos!==undefined){
            const segundos=b.noticia_segundos;
            insist(Number.isInteger(segundos)&&segundos>=5&&segundos<=600,'Informe de 5 a 600 segundos por notícia.');
            d.noticia_segundos=segundos;
          }
          if(Array.isArray(b.ambientes)){
            insist(b.ambientes.length<=4,'Preencha até quatro ambientes.');
            d.ambientes=b.ambientes.map(item=>fields(item,['nome','horario'],['telefone']));
          }else{
            const anterior=fields(b,['secretaria','biblioteca']);
            Object.assign(d,anterior);
          }
        }
        else insist(false,'Página não encontrada.',404);
        return reply(200,await rpc(acao,d,'totem_api'));
      }
      if(mapRequest&&['balcao','pegar','entregar','relatorio'].includes(action)){
        const p={};
        if(action==='relatorio'){day(b.data);p.data=b.data;}
        if(action==='pegar'||action==='entregar'){
          limitarMovimentos(req);
          const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
          Object.assign(p,fields(b,['nome']));
          if(action==='pegar'){
            insist(uuid.test(b.pedido)&&uuid.test(b.revisao)&&Number.isInteger(b.indice)&&b.indice>=0&&b.indice<500,'Atualize o mapa e escolha a aula.');
            Object.assign(p,{pedido:b.pedido,revisao:b.revisao,indice:b.indice});
          }else{insist(uuid.test(b.id),'Escolha a chave retirada.');p.id=b.id;}
        }
        return reply(200,await rpc(action,p,'chaves_excel_api'));
      }
      if(mapRequest&&['excel-consultar','excel-publicar'].includes(action)){
        day(b.data);
        const p={data:b.data};
        if(action==='excel-publicar'){
          insist(b.revisao===null||typeof b.revisao==='string','Confira o mapa novamente.');
          insist(Array.isArray(b.aulas)&&b.aulas.length>0&&b.aulas.length<=500,'Selecione entre 1 e 500 atividades.');
          p.revisao=b.revisao;
          p.aulas=b.aulas.map(a=>{
            insist(a&&[0,1,2].includes(a.turno),'Turno inválido.');
            return {...fields(a,['turma','sala'],['docente','horario']),turno:a.turno};
          });
        }
        return reply(200,await rpc(action,p,'mapa_excel_api'));
      }
      let data;
      if(mapRequest)insist(['solicitar','ativar','entrar','master/aprovar','master/rejeitar'].includes(action),'Página não encontrada.',404);
      switch(action){
        case 'solicitar': {
          const d=fields(b,['nome','email']);
          insist(d.email.endsWith('@sp.senac.br'),'Use seu e-mail institucional @sp.senac.br.');
          return reply(200,mapRequest?await accessRpc(action,d):await areasRpc(action,{...d,area:b.area==='totem'?'totem':'inovacao'}));
        }
        case 'master/aprovar': {
          const {id}=fields(b,['id']),codigo=newCode();
          if(mapRequest)await accessRpc(action,{id,digest:digest(codigo)});else await areasRpc(action,{id,digest:digest(codigo),area:escolherArea(b.area??'inovacao')});return reply(200,{codigo});
        }
        case 'master/area':return reply(200,await areasRpc(action,{...fields(b,['id']),area:escolherArea(b.area)}));
        case 'master/rejeitar':return reply(200,await accessRpc(action,fields(b,['id'])));
        case 'ativar': {
          const {email,codigo}=fields(b,['email','codigo']);
          insist(typeof b.senha==='string' && b.senha.length>=8 && b.senha.length<=1024,'Use pelo menos 8 caracteres.');
          const hash=digest(codigo);
          insist(await accessRpc('validar-convite',{email,digest:hash})===true,'Convite inválido ou expirado.',403);
          const created=await authAdmin('','POST',{email,password:b.senha,email_confirm:true});
          let uid;
          if(created.ok){uid=(await created.json()).id;}
          else {
            insist(created.status===422 || created.status===400,'Não foi possível criar a conta.',503);
            const login=await auth('token?grant_type=password',{method:'POST',body:JSON.stringify({email,password:b.senha})});
            insist(login.ok,'Confira a política de senha. Se a conta já existir, use sua senha atual.',400);
            const {user}=await login.json();uid=user?.email_confirmed_at && user.id;
          }
          insist(uid,'Conta sem confirmação.',403);
          return reply(200,await accessRpc('ativar',{email,digest:hash,uid}));
        }
        case 'admin/reserva': {
          const codigo=newCode();await rpc('guardar-reserva',{uid:staff.id,digest:digest(codigo)});
          return reply(200,{codigo});
        }
        case 'usar-reserva': {
          const {email,codigo}=fields(b,['email','codigo']);
          insist(typeof b.senha==='string' && b.senha.length>=8 && b.senha.length<=1024,'Use pelo menos 8 caracteres.');
          const uid=await rpc(op,{email,digest:digest(codigo)});
          insist(typeof uid==='string' && (adminIds.has(uid) || await rpc('autorizado',{uid})===true),'Chave inválida ou já utilizada.',403);
          const changed=await authAdmin('/'+encodeURIComponent(uid),'PUT',{password:b.senha});
          insist(changed.ok,'O provedor recusou a alteração. A chave foi consumida. Utilize a recuperação por e-mail ou suporte do projeto.',400);
          return reply(200,{ok:true});
        }
        case 'recuperar': {
          const {email}=fields(b,['email']);
          const r=await auth('recover?redirect_to='+encodeURIComponent(origin+'/'),{method:'POST',body:JSON.stringify({email})});
          insist(r.status!==429,'Aguarde antes de solicitar outro link.',429);
          insist(r.ok,'O serviço de e-mail não aceitou o pedido. Com o remetente padrão, confirme com o responsável se o endereço pode receber a mensagem.',503);
          return reply(200,{ok:true});
        }
        case 'redefinir': {
          insist(typeof b.token==='string' && b.token.length>0 && b.token.length<16000,'Abra o link enviado por e-mail.');
          insist(typeof b.senha==='string' && b.senha.length>=8 && b.senha.length<=1024,'Use uma senha com pelo menos 8 caracteres.');
          insist(await admin(b.token),'O link expirou ou a conta não tem acesso administrativo. Solicite outro link.',403);
          const headers={Authorization:'Bearer '+b.token};
          const change=await auth('user',{method:'PUT',headers,body:JSON.stringify({password:b.senha})});
          insist(change.ok,'A senha não foi alterada. Solicite outro link e escolha uma nova senha conforme as regras da instituição.',400);
          res.setHeader('Set-Cookie',sessionCookie('',0));
          return reply(200,{ok:true});
        }
        case 'entrar': {
          const {email}=fields(b,['email']);
          insist(typeof b.senha==='string' && b.senha.length>0 && b.senha.length<=1024,'Informe a senha.');
          const r=await auth('token?grant_type=password',{method:'POST',body:JSON.stringify({email,password:b.senha})});
          if(r.status===429)throw Object.assign(new Error('Muitas tentativas. Aguarde e tente novamente.'),{status:429});
          insist(r.status<500,'Serviço de login indisponível.',503);
          insist(r.ok,'E-mail ou senha inválidos.',403);
          const s=await r.json();
          insist(await (mapRequest?mapAllowed(s.user):authorized(s.user)) && s.access_token,'Conta sem acesso administrativo.',403);
          if(!mapRequest && b.area){const permitida=await areaConta(s.user);insist(permitida==='ambas'||permitida===b.area,'Sua conta não tem acesso a esta área.',403);}
          res.setHeader('Set-Cookie',sessionCookie(s.access_token,Math.max(1,Math.floor(s.expires_in))));
          return reply(200,{ok:true});
        }
        case 'sair':
          res.setHeader('Set-Cookie',sessionCookie('',0));
          if(token)await auth('logout?scope=local',{method:'POST',headers:{Authorization:'Bearer '+token}});
          return reply(200,{ok:true});
        case 'noticia': data={...fields(b,['titulo','descricao','categoria'],['autor','turma','curso']),imagem:photo(b)};break;
        case 'oficina': data=workshop(b,false,new Map(await mapRpc('salas',{})));break;
        case 'ideia': data=fields(b,['perfil','categoria','texto'],['nome']);break;
        case 'inscrever':data=fields(b,['nome','email','workshop'],['cargo','area']);break;
        case 'admin/editar-noticia':
          data=fields(b,['id','titulo','descricao','categoria'],['autor','turma','curso']);
          if(b.imagem!==undefined)data.imagem=photo(b);
          break;
        case 'admin/editar-acao':
          data=fields(b,['id','titulo','descricao']);if(b.imagem!==undefined)data.imagem=photo(b);break;
        case 'admin/excluir-oficina':case 'admin/apagar-ideia':case 'admin/arquivar-ideia':case 'admin/arquivar-noticia':
        case 'admin/excluir-noticia':data=fields(b,['id']);break;
        case 'admin/acao':data={...fields(b,['titulo','descricao']),imagem:photo(b)};break;
        case 'admin/editar':{const rooms=new Map(await mapRpc('salas',{}));data={...workshop(b,true,rooms),...fields(b,['id']),localLegado:!rooms.has(b.local)};break;}
        case 'admin/moderar':case 'admin/moderar-noticia':data=fields(b,['id','status']);insist(['aprovada','arquivada'].includes(data.status),'Decisão inválida.');return reply(200,await areasRpc('moderar',{...data,kind:op==='admin/moderar'?'oficina':'noticia'}));
        case 'admin/apagar':data=fields(b,['id']);break;
        default: return reply(404,{erro:'Página não encontrada.'});
      }
      return reply(['admin/editar','admin/moderar','admin/apagar','admin/editar-noticia','admin/excluir-noticia'].includes(op)?200:201,await rpc(op,data));
    }catch(e){
      const status=Number.isInteger(e.status)?e.status:503;
      reply(status,{erro:e.status?e.message:'Serviço temporariamente indisponível. Tente novamente.'});
    }
  });
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  createPortal(process.env).listen(Number(process.env.PORT||3000),'0.0.0.0');
}
