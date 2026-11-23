// Uma única prancheta vetorial mantém todas as salas na mesma página A4.
function folhaDiaria(salas, reservas, data) {
  const largura = 1010;
  const x = [8, 181, 458, 735];
  const texto = (valor, coluna, y, tamanho, negrito = false) =>
    '<text x="' + x[coluna] + '" y="' + y + '" font-size="' + tamanho +
    '" font-weight="' + (negrito ? 700 : 400) + '">' + esc(valor) + '</text>';
  function quebrar(valor, limite) {
    const linhas = [];
    let resto = String(valor).trim();
    while (resto.length > limite) {
      const espaco = resto.lastIndexOf(' ', limite);
      const corte = espaco > 0 ? espaco : limite;
      linhas.push(resto.slice(0, corte));
      resto = resto.slice(corte).trimStart();
    }
    linhas.push(resto);
    return linhas;
  }
  const doDia = reservas.filter(r => r.dia === data);
  const elementos = [texto('Mapa de salas · Senac Salto', 0, 26, 21, true),
    texto(br(data), 3, 26, 17, true)];
  ['Sala', 'Manhã', 'Tarde', 'Noite'].forEach((titulo, i) => elementos.push(texto(titulo, i, 56, 14, true)));
  let topo = 65;
  for (const sala of salas) {
    const colunas = [quebrar(sala.nome, 23), [], [], []];
    for (const r of doDia.filter(r => r.sala === sala.id)) {
      const inicio = time(r.inicio);
      const coluna = inicio < '13:00' ? 1 : inicio < '19:00' ? 2 : 3;
      const horario = inicio + '–' + time(r.fim);
      colunas[coluna].push(...quebrar(horario + '  ' + (r.turma_nome || r.titulo || ''), 37));
    }
    elementos.push('<path d="M0 '+topo+'h1010" stroke="#bec7cd" stroke-width="1"/>');
    colunas.forEach((linhas, i) => {
      linhas.forEach((linha, j) => elementos.push(texto(linha, i, topo + 17 + j * 15, 12, i === 0)));
    });
    topo += Math.max(30, Math.max(...colunas.map(c => c.length)) * 15 + 7);
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mapa diário de salas" ' +
    'viewBox="0 0 '+largura+' '+(topo+3)+'" preserveAspectRatio="xMinYMin meet" ' +
    'font-family="monospace" fill="#182430">'+elementos.join('')+'</svg>';
}
