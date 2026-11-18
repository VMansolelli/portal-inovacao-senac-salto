export function insist(condition, message, status = 400) {
  if (!condition) throw Object.assign(new Error(message), { status });
}
export function fields(input, required, optional = []) {
  const out = {};
  for (const key of [...required, ...optional]) {
    const value = input[key] ?? '';
    insist(typeof value === 'string', 'Campo inválido.');
    out[key] = value.trim();
    insist(!required.includes(key) || out[key], 'Preencha os campos obrigatórios.');
    insist(out[key].length <= (['texto','descricao'].includes(key) ? 5000 : 254), 'Um dos campos excede o tamanho permitido.');
  }
  if (out.email) {
    insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email),'Informe um e-mail válido.');
    out.email = out.email.toLowerCase();
  }
  return out;
}
export function workshop(input) {
  const w = fields(input,['titulo','docente','email','area','data','inicio','termino','local']);
  w.vagas = Number(input.vagas);
  insist(Number.isSafeInteger(w.vagas) && w.vagas >= 1 && w.vagas <= 10000,'Informe entre 1 e 10.000 vagas.');
  const day = new Date(w.data+'T12:00:00Z');
  insist(/^\d{4}-\d\d-\d\d$/.test(w.data) && !isNaN(day) && day.toISOString().startsWith(w.data),'Data inválida.');
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  insist(time.test(w.inicio) && time.test(w.termino) && w.inicio < w.termino,'O término deve ser depois do início.');
  return w;
}
export function photo(input) {
  insist(typeof input.imagem === 'string' && input.imagem.length < 650000 && /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+=*$/.test(input.imagem),'Selecione uma foto válida de tamanho menor.');
  return input.imagem;
}
