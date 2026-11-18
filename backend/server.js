import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {fields,workshop,photo,insist} from './validation.js';

export function createPortal(config, remote = fetch) {
  const origin = new URL(config.FRONTEND_ORIGIN).origin;
  const base = new URL(config.SUPABASE_URL);
  const adminIds = new Set([config.ADMIN_USER_ID, config.ADMIN_USER_IDS].filter(Boolean).join(',').split(',').map(id=>id.trim()).filter(Boolean));
  const authorized = user => !!user?.email_confirmed_at && adminIds.has(user.id);
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
  async function rpc(op,p={}) {
    const r=await remote(new URL('/rest/v1/rpc/portal_api',base),{method:'POST',signal:AbortSignal.timeout(20000),
      headers:{apikey:config.SUPABASE_SECRET_KEY,'Content-Type':'application/json'},body:JSON.stringify({op,p})});
    insist(r.ok,'Não foi possível consultar o banco de dados.',503);
    const result=await r.json();
    insist(!result?.conflict,result?.conflict,409);
    return result;
  }
  async function admin(token) {
    if(!token)return false;
    const r=await auth('user',{headers:{Authorization:'Bearer '+token}});
    if(r.status>=500)throw Object.assign(new Error('Serviço de login indisponível.'),{status:503});
    if(!r.ok)return false;
    const u=await r.json();
    return authorized(u);
  }
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
      res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));
    }
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    try{
      const path=new URL(req.url,'http://localhost').pathname;
      if(req.method==='GET' && path==='/health')return reply(200,{ok:true});
      insist(path.startsWith('/api/'),'Página não encontrada.',404);
      const op=path.slice(5);
      const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
      if(req.method==='POST')insist(!req.headers.origin || req.headers.origin===origin,'Origem inválida.',403);
      if(op.startsWith('admin/'))insist(await admin(token),'Entre com a conta administrativa.',403);
      if(req.method==='GET'){
        if(['admin/lista','publico'].includes(op))return reply(200,await rpc(op));
        if(op.startsWith('admin/inscritos/'))return reply(200,await rpc('admin/inscritos',{id:op.slice(16)}));
        if(op.startsWith('foto/')){
          const src=await rpc(token && await admin(token)?'admin/foto':'foto',{id:op.slice(5)});
          insist(src,'Foto não encontrada.',404);
          res.writeHead(200,{'Content-Type':'image/jpeg'});return res.end(Buffer.from(src.split(',')[1],'base64'));
        }
      }
      insist(req.method==='POST','Página não encontrada.',404);
      const b=await read(req);
      let data;
      switch(op){
        case 'recuperar': {
          const {email}=fields(b,['email']);
          const r=await auth('recover',{method:'POST',body:JSON.stringify({email})});
          insist(r.status!==429,'Aguarde antes de solicitar outro código.',429);
          insist(r.status<500,'Não foi possível enviar o e-mail de recuperação.',503);
          return reply(200,{ok:true});
        }
        case 'redefinir': {
          const {email,codigo}=fields(b,['email','codigo']);
          insist(/^\d{6,10}$/.test(codigo),'Confira o código recebido por e-mail.');
          insist(typeof b.senha==='string' && b.senha.length>=8 && b.senha.length<=1024,'Use uma senha com pelo menos 8 caracteres.');
          const verify=await auth('verify',{method:'POST',body:JSON.stringify({email,token:codigo,type:'recovery'})});
          insist(verify.status!==429,'Muitas tentativas. Aguarde antes de continuar.',429);
          insist(verify.status<500,'Serviço de recuperação indisponível.',503);
          insist(verify.ok,'Código inválido ou expirado. Confira o código ou solicite outro.',400);
          const session=await verify.json();
          insist(authorized(session.user) && session.access_token,'Esta conta não tem acesso ao painel.',403);
          const headers={Authorization:'Bearer '+session.access_token};
          const change=await auth('user',{method:'PUT',headers,body:JSON.stringify({password:b.senha})});
          insist(change.ok,'A senha não foi alterada. Solicite outro código e escolha uma nova senha conforme as regras da instituição.',400);
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
          insist(authorized(s.user) && s.access_token,'Conta sem acesso administrativo.',403);
          res.setHeader('Set-Cookie',sessionCookie(s.access_token,Math.max(1,Math.floor(s.expires_in))));
          return reply(200,{ok:true});
        }
        case 'sair':
          res.setHeader('Set-Cookie',sessionCookie('',0));
          if(token)await auth('logout?scope=local',{method:'POST',headers:{Authorization:'Bearer '+token}});
          return reply(200,{ok:true});
        case 'noticia': data={...fields(b,['titulo','turma','curso','descricao','categoria'],['autor']),imagem:photo(b)};break;
        case 'oficina': data=workshop(b);break;
        case 'ideia': data=fields(b,['perfil','categoria','texto'],['nome']);break;
        case 'inscrever':data=fields(b,['nome','email','workshop'],['cargo','area']);break;
        case 'admin/acao':data={...fields(b,['titulo','descricao']),imagem:photo(b)};break;
        case 'admin/editar':data={...workshop(b),...fields(b,['id'])};break;
        case 'admin/moderar':data=fields(b,['id','status']);insist(['aprovada','arquivada'].includes(data.status),'Decisão inválida.');break;
        case 'admin/apagar':data=fields(b,['id']);break;
        default: return reply(404,{erro:'Página não encontrada.'});
      }
      return reply(['admin/editar','admin/moderar','admin/apagar'].includes(op)?200:201,await rpc(op,data));
    }catch(e){
      const status=Number.isInteger(e.status)?e.status:503;
      reply(status,{erro:e.status?e.message:'Serviço temporariamente indisponível. Tente novamente.'});
    }
  });
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  createPortal(process.env).listen(Number(process.env.PORT||3000),'0.0.0.0');
}
