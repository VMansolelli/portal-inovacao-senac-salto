(() => {
  'use strict';

  // Letras do português pertencem à faixa Latin-1 da codificação WinAnsi.
  const extras = '€\0‚ƒ„…†‡ˆ‰Š‹Œ\0Ž\0\0‘’“”•–—˜™š›œ\0žŸ';
  function encode(value) {
    return Array.from(value.normalize('NFC'), char => {
      const code = char.codePointAt(0);
      const extra = extras.indexOf(char);
      const byte = code <= 255 ? code : extra >= 0 ? 128 + extra : 63;
      return byte.toString(16).padStart(2, '0');
    }).join('');
  }

  function wrap(value, limit) {
    let rest = String(value ?? '').replace(/\s+/g, ' ').trim();
    const lines = [];
    while (rest.length > limit) {
      const space = rest.lastIndexOf(' ', limit);
      const end = space > 0 ? space : limit;
      lines.push(rest.slice(0, end));
      rest = rest.slice(end).trimStart();
    }
    lines.push(rest);
    return lines;
  }

  function createReport(oficina, inscritos) {
    const pages = [];
    let lines;
    let y;
    function write(text, font, size, color, at = y) {
      lines.push(`BT /${font} ${size} Tf ${color} rg 1 0 0 1 44 ${at} Tm <${encode(text)}> Tj ET`);
    }
    function newPage() {
      lines = [];
      pages.push(lines);
      write('Senac Salto  |  Saberes em Movimento', 'F2', 11, '0 .28 .48', 795);
      write('Lista de inscritos', 'F2', 23, '0 .18 .32', 764);
      lines.push('0.95 0.55 0.12 RG 2 w 44 750 m 551 750 l S');
      y = 725;
    }
    function paragraph(value, {bold = false, size = 11, limit = 76} = {}) {
      for (const line of wrap(value, limit)) {
        if (y < 65) newPage();
        write(line, bold ? 'F2' : 'F1', size, '0.1 0.14 0.18');
        y -= size + 5;
      }
    }
    newPage();
    paragraph(oficina.titulo || oficina.nome || 'Oficina', {bold: true, size: 14, limit: 36});
    const date = String(oficina.data || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1');
    paragraph(`${date}  |  ${oficina.inicio} às ${oficina.termino}`);
    paragraph(`Local: ${oficina.local}`);
    paragraph(`Inscritos: ${inscritos.length}  |  Vagas: ${oficina.vagas}`);
    y -= 12;
    if (!inscritos.length) paragraph('Nenhuma inscrição registrada.');
    inscritos.forEach((pessoa, index) => {
      const fields = [[`${index + 1}. ${pessoa.nome}`, true], [`E-mail: ${pessoa.email}`, false]];
      if (pessoa.cargo) fields.push([`Cargo: ${pessoa.cargo}`, false]);
      if (pessoa.area) fields.push([`Área: ${pessoa.area}`, false]);
      const height = fields.reduce((sum, [value, bold]) => sum + wrap(value, bold ? 45 : 76).length * 16, 0);
      if (y - height < 49 && y < 725) newPage();
      for (const [value, bold] of fields) paragraph(value, {bold, limit: bold ? 45 : 76});
      y -= 10;
    });

    const objects = ['', '<< /Type /Catalog /Pages 2 0 R >>', '',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
    const kids = [];
    pages.forEach((page, index) => {
      lines = page;
      write(`Página ${index + 1} de ${pages.length}`, 'F1', 9, '.3 .3 .3', 35);
      const stream = lines.join('\n') + '\n';
      const id = objects.length;
      kids.push(`${id} 0 R`);
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id + 1} 0 R >>`,
        `<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    });
    objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${kids.join(' ')}] >>`;
    let pdf = '%PDF-1.4\n';
    const offsets = ['0000000000 65535 f '];
    for (let i = 1; i < objects.length; i++) {
      offsets.push(String(pdf.length).padStart(10, '0') + ' 00000 n ');
      pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const start = pdf.length;
    pdf += `xref\n0 ${objects.length}\n${offsets.join('\n')}\ntrailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
    return new Blob([pdf], {type: 'application/pdf'});
  }

  window.baixarLista = (oficina, inscritos) => {
    const blob = createReport(oficina, inscritos);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const slug = String(oficina.titulo || oficina.nome || 'oficina').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 75);
    link.download = `inscritos-${slug || 'oficina'}.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 60000);
  };
})();
