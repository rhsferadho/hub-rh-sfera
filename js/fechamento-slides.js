// Fechamento do Período: monta os slides como uma lista de elementos
// posicionados num quadro de 960 × 540 PONTOS — o tamanho do deck do RH
// (13,33 × 7,5 pol., 16:9), com as mesmas posições dos slides originais. A mesma
// descrição é desenhada na tela (sections/fechamento.js) e exportada para
// PPTX (fechamento-pptx.js), então o que se vê é o que se baixa.
//
// Elementos:
//   { t:'rect', x, y, w, h, fill, transp (0–100), line, r (cantos, px) }
//   { t:'text', x, y, w, h, size (pt), color, bold, align, valign, paras:[{ runs:[{text,bold,color,size,italic}], bullet }] }
//   { t:'chart', x, y, w, h, kind:'col'|'bar'|'combo', title, labels, series:[{name, values, color, line}], legend, pct }
// Texto aceita **negrito** (ver txt()).
(function () {
  const COR = {
    azul: '1C7CEC', branco: 'FFFFFF', claro: 'CADCFC', suave: '8EA3CF', valor: '2F80ED',
    card: '0A1942', borda: '5C76A8', amarelo: 'F2B84B', laranja: 'F28C38', verde: '3CCB8B', vermelho: 'F46A6A', estr: 'C7D6F5'
  };
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const MES3 = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const pad = n => String(n).padStart(2, '0');
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  // ---------------------------------------------------------------------
  // Períodos: mensal (n = mês), bimestral (n = 1–6), semestral (1–2), anual.
  // ---------------------------------------------------------------------
  const TIPOS = {
    mensal: { qtd: 12, meses: 1 }, bimestral: { qtd: 6, meses: 2 }, semestral: { qtd: 2, meses: 6 }, anual: { qtd: 1, meses: 12 }
  };
  function periodo(tipo, ano, n) {
    const t = TIPOS[tipo];
    if (!t) throw new Error('Tipo de período inválido: ' + tipo);
    n = tipo === 'anual' ? 1 : n;
    const m1 = (n - 1) * t.meses + 1, m2 = m1 + t.meses - 1;
    const ultimoDia = new Date(Date.UTC(ano, m2, 0)).getUTCDate();
    const aa = String(ano).slice(2);
    let label, curto, nome;
    if (tipo === 'mensal') { label = `${MESES[m1 - 1]} ${ano}`; curto = `${MES3[m1 - 1].toLowerCase()}/${aa}`; nome = MESES[m1 - 1].toLowerCase(); }
    else if (tipo === 'bimestral') { label = `${MESES[m1 - 1]} e ${MESES[m2 - 1]} ${ano}`; curto = `${MES3[m1 - 1].toLowerCase()}–${MES3[m2 - 1].toLowerCase()}/${aa}`; nome = 'o bimestre'; }
    else if (tipo === 'semestral') { label = `${n}º Semestre ${ano}`; curto = `${n}S/${aa}`; nome = 'o semestre'; }
    else { label = `Ano ${ano}`; curto = String(ano); nome = 'o ano'; }
    return { tipo, ano, n, m1, m2, meses: t.meses, de: `${ano}-${pad(m1)}-01`, ate: `${ano}-${pad(m2)}-${pad(ultimoDia)}`, label, curto, nome };
  }
  const mesmoPeriodoAnoAnterior = p => periodo(p.tipo, p.ano - 1, p.n);
  // "em setembro 2026", "em julho e agosto 2026", "em 2026".
  const emPeriodo = p => 'em ' + (p.tipo === 'anual' ? String(p.ano) : p.label.toLowerCase());

  // ---------------------------------------------------------------------
  // Utilitários de texto e números
  // ---------------------------------------------------------------------
  const fmtInt = v => (v == null ? '—' : Math.round(v).toLocaleString('pt-BR'));
  const fmtPct = (v, casas) => (v == null ? '—' : (v * 100).toFixed(casas || 0).replace('.', ',') + '%');
  const fmtDias = v => (v == null ? '—' : Math.round(v) + ' dias');
  const fmtData = iso => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
  const pp = (a, b) => { if (a == null || b == null) return null; const d = Math.round((a - b) * 100); return (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d) + ' p.p.'; };
  const varPct = (a, b) => (b ? (a - b) / b : null);

  // "**92 vagas** fechadas" → runs com negrito.
  function runs(s, base) {
    const out = [];
    String(s).split(/(\*\*[^*]+\*\*)/).forEach(part => {
      if (!part) return;
      const b = /^\*\*.*\*\*$/.test(part);
      out.push(Object.assign({}, base || {}, { text: b ? part.slice(2, -2) : part }, b ? { bold: true } : {}));
    });
    return out;
  }
  const para = (s, opts) => Object.assign({ runs: runs(s, opts && opts.run) }, opts || {});

  // Natureza principal: "Substituição - Cota" conta como Substituição.
  const naturezaPrincipal = v => (v.natureza ? v.natureza.split(' - ')[0].trim() : '(não informado)');

  // ---------------------------------------------------------------------
  // Blocos visuais
  // ---------------------------------------------------------------------
  function titulo(texto) {
    return [
      { t: 'rect', x: 22, y: 38, w: 6, h: 30, fill: COR.azul, r: 3 },
      { t: 'text', x: 40, y: 37, w: 830, h: 34, size: 22, bold: true, color: COR.branco, valign: 'middle', paras: [para(texto)] }
    ];
  }
  function resumo(texto) {
    return { t: 'text', x: 40, y: 76, w: 830, h: 36, size: 11, color: COR.branco, valign: 'top', paras: [para(texto)] };
  }
  function card(x, y, w, h) {
    return { t: 'rect', x, y, w, h, fill: COR.card, transp: 45, line: COR.borda, r: 10 };
  }
  function kpi(x, y, w, h, rotulo, valor, sub, corValor) {
    return [
      card(x, y, w, h),
      { t: 'text', x: x + 12, y: y + 8, w: w - 24, h: 18, size: 10.5, bold: true, color: COR.claro, paras: [para(rotulo)] },
      { t: 'text', x: x + 12, y: y + 30, w: w - 24, h: 40, size: 28, bold: true, color: corValor || COR.valor, valign: 'middle', paras: [para(valor)] },
      { t: 'text', x: x + 12, y: y + h - 26, w: w - 24, h: 18, size: 9, color: COR.suave, paras: [para(sub || '')] }
    ];
  }

  // ---------------------------------------------------------------------
  // Slides
  // ---------------------------------------------------------------------
  function slideCapa(p) {
    return {
      id: 'capa', nome: 'Capa', fundo: 'capa',
      els: [
        { t: 'rect', x: 96, y: 139, w: 9, h: 123, fill: COR.azul, r: 4 },
        { t: 'text', x: 117, y: 132, w: 640, h: 68, size: 60, bold: true, color: COR.azul, valign: 'middle', paras: [para('FECHAMENTO')] },
        { t: 'text', x: 117, y: 195, w: 700, h: 81, size: 60, bold: true, color: COR.branco, valign: 'middle', paras: [para('RECURSOS HUMANOS')] },
        { t: 'text', x: 117, y: 271, w: 600, h: 29, size: 18, bold: true, color: COR.branco, valign: 'middle', paras: [para('RELATÓRIO – ' + p.label.toUpperCase())] }
      ]
    };
  }

  function slideDivisor(id, linha1, linha2) {
    return {
      id, nome: linha1 + ' ' + linha2, fundo: 'divisor',
      els: [
        { t: 'rect', x: 106, y: 198, w: 11, h: 123, fill: COR.azul, r: 5 },
        { t: 'text', x: 129, y: 192, w: 640, h: 68, size: 54, bold: true, color: COR.azul, valign: 'middle', paras: [para(linha1)] },
        { t: 'text', x: 129, y: 260, w: 640, h: 77, size: 54, bold: true, color: COR.branco, valign: 'middle', paras: [para(linha2)] }
      ]
    };
  }

  function topFontes(lista) {
    const comFonte = lista.filter(f => f.nome !== '(não informado)');
    const total = comFonte.reduce((s, f) => s + f.qtd, 0);
    const top = comFonte.slice(0, 5);
    return { labels: top.map(f => f.nome), values: top.map(f => (total ? f.qtd / total : 0)), total };
  }

  function slideVagasFinalizadas(vagas, p, M) {
    const r = M.periodo(vagas, p.de, p.ate);
    const a = M.periodo(vagas, mesmoPeriodoAnoAnterior(p).de, mesmoPeriodoAnoAnterior(p).ate);
    const pa = mesmoPeriodoAnoAnterior(p);
    const pOp = r.fechadas ? r.operacional.fechadas / r.fechadas : null;
    const texto = r.fechadas
      ? `Fechamos ${p.nome} com **${fmtInt(r.fechadas)} vagas**, sendo ${fmtPct(pOp)} operacionais e ${fmtPct(1 - pOp)} estratégicas, com **${fmtPct(r.noPrazo)} dentro do prazo** de SLA e média de **${fmtDias(r.diasMedio)}**.`
      : `Nenhuma vaga finalizada ${emPeriodo(p)}.`;

    // Natureza (principal) × tipo das vagas fechadas no período.
    const fechadas = vagas.filter(v => v.status_vaga === 'Finalizada' && v.data_fechamento && v.data_fechamento >= p.de && v.data_fechamento <= p.ate);
    const nat = {};
    fechadas.forEach(v => { const k = naturezaPrincipal(v); nat[k] = nat[k] || { op: 0, es: 0 }; nat[k][v.tipo_vaga === 'Estratégica' ? 'es' : 'op']++; });
    const naturezas = Object.keys(nat).sort((x, y) => (nat[y].op + nat[y].es) - (nat[x].op + nat[x].es)).slice(0, 5);
    const fOp = topFontes(r.fontesOperacional), fEs = topFontes(r.fontesEstrategica);

    const subFechadas = p.meses > 1 ? `≈ ${fmtInt(r.fechadas / p.meses)} vagas/mês · ${fmtInt(a.fechadas)} em ${pa.curto}` : `${fmtInt(a.fechadas)} em ${pa.curto}`;
    const els = [].concat(
      titulo(`VAGAS FINALIZADAS — ${p.label.toUpperCase()}`),
      resumo(texto),
      kpi(25, 120, 190, 100, `VAGAS FECHADAS (${p.curto})`, fmtInt(r.fechadas), subFechadas),
      kpi(230, 120, 190, 100, 'DENTRO DO PRAZO (SLA)', fmtPct(r.noPrazo), `${fmtPct(a.noPrazo)} em ${pa.curto}` + (pp(r.noPrazo, a.noPrazo) ? ` (${pp(r.noPrazo, a.noPrazo)})` : ''), r.noPrazo != null && r.noPrazo < 0.7 ? COR.amarelo : COR.valor),
      [card(435, 120, 330, 100),
        { t: 'text', x: 447, y: 128, w: 306, h: 18, size: 10.5, bold: true, color: COR.claro, align: 'center', paras: [para('SLA MÉDIO DE FECHAMENTO')] },
        { t: 'rect', x: 447, y: 150, w: 147, h: 60, fill: '1C3D7A', transp: 30, line: '3A6BC4', r: 6 },
        { t: 'text', x: 455, y: 153, w: 135, h: 54, size: 10, color: COR.claro, paras: [
          para('**Operacionais**'),
          { runs: [{ text: r.operacional.diasMedio == null ? '—' : String(Math.round(r.operacional.diasMedio)), bold: true, size: 16, color: '2BB3FF' }, { text: ' dias', size: 9, color: '2BB3FF' }] },
          para(`${fmtInt(r.operacional.fechadas)} vagas · ${fmtPct(r.operacional.noPrazo)} no prazo`, { run: { size: 8.5, color: COR.suave } })
        ] },
        { t: 'rect', x: 606, y: 150, w: 147, h: 60, fill: '3A3A3A', transp: 50, line: '7A6A3A', r: 6 },
        { t: 'text', x: 614, y: 153, w: 135, h: 54, size: 10, color: COR.claro, paras: [
          para('**Estratégicas**'),
          { runs: [{ text: r.estrategica.diasMedio == null ? '—' : String(Math.round(r.estrategica.diasMedio)), bold: true, size: 16, color: COR.amarelo }, { text: ' dias', size: 9, color: COR.amarelo }] },
          para(`${fmtInt(r.estrategica.fechadas)} vagas · ${fmtPct(r.estrategica.noPrazo)} no prazo`, { run: { size: 8.5, color: COR.suave } })
        ] }],
      kpi(780, 120, 155, 100, 'CANCELADAS', fmtInt(r.canceladas), 'com data no período', COR.claro),
      [
        { t: 'chart', x: 25, y: 238, w: 300, h: 232, kind: 'col', title: 'NATUREZA DA VAGA', legend: true, labels: naturezas,
          series: [{ name: 'Operacional', values: naturezas.map(k => nat[k].op), color: COR.azul }, { name: 'Estratégica', values: naturezas.map(k => nat[k].es), color: COR.estr }] },
        { t: 'chart', x: 335, y: 238, w: 300, h: 232, kind: 'bar', pct: true, title: 'TOP 5 FONTES — OPERACIONAL', labels: fOp.labels, series: [{ name: 'Operacional', values: fOp.values, color: COR.azul }] },
        { t: 'chart', x: 645, y: 238, w: 300, h: 232, kind: 'bar', pct: true, title: 'TOP 5 FONTES — ESTRATÉGICA', labels: fEs.labels, series: [{ name: 'Estratégica', values: fEs.values, color: COR.azul }] }
      ]
    );
    const notas = [
      `Fonte: planilha 18 (Controle Geral de Vagas). Vagas com status Finalizada e DATA DE FECHAMENTO entre ${fmtData(p.de)} e ${fmtData(p.ate)}.`,
      'SLA pela regra oficial do R&S (dias corridos da abertura ao fechamento): Operacional Loja RJ 20, VD RJ/SG 25, Loja MG 34, VD MG 34; Estratégica 35.',
      `Pela coluna "Status SLA" da planilha, ${fmtPct(r.noPrazoPlanilha)} no prazo.`,
      `Fontes: % entre as vagas com FONTE preenchida (Operacional ${fOp.total}, Estratégica ${fEs.total}).`
    ].join('\n');
    return { id: 'rs-finalizadas', nome: 'Vagas Finalizadas', fundo: 'conteudo', els, notas };
  }

  function slideComparativo(vagas, p) {
    const pa = mesmoPeriodoAnoAnterior(p);
    const abertasEm = q => vagas.filter(v => v.data_abertura >= q.de && v.data_abertura <= q.ate);
    const atual = abertasEm(p), ant = abertasEm(pa);
    const conta = (lista, nat, tipo) => lista.filter(v => naturezaPrincipal(v) === nat && (v.tipo_vaga === 'Estratégica') === (tipo === 'Estratégica')).length;
    const fechadasNoPeriodo = (lista, q) => (lista.length ? lista.filter(v => v.status_vaga === 'Finalizada' && v.data_fechamento && v.data_fechamento <= q.ate).length / lista.length : null);
    const yy = String(p.ano).slice(2), yyA = String(pa.ano).slice(2);
    const grupos = ['Aumento de Quadro', 'Substituição'];

    // Maior variação entre natureza × tipo, para o texto.
    const linhas = [];
    const nats = Array.from(new Set(atual.concat(ant).map(naturezaPrincipal)));
    nats.forEach(n => ['Operacional', 'Estratégica'].forEach(t => linhas.push({ n, t, a: conta(ant, n, t), b: conta(atual, n, t) })));
    linhas.sort((x, y) => Math.abs(y.b - y.a) - Math.abs(x.b - x.a));
    const maior = linhas[0];
    const v = varPct(atual.length, ant.length);
    let texto = ant.length
      ? `No comparativo do mesmo período, o total de vagas abertas ${v < 0 ? 'caiu' : v > 0 ? 'subiu' : 'ficou estável'}${v ? ' ' + fmtPct(Math.abs(v)) : ''}, de **${fmtInt(ant.length)}** para **${fmtInt(atual.length)}**.`
      : `Sem vagas abertas em ${pa.curto} para comparar.`;
    if (maior && maior.a !== maior.b) {
      const vm = varPct(maior.b, maior.a);
      texto += ` A maior variação foi em **${maior.n} ${maior.t}**, de ${fmtInt(maior.a)} para ${fmtInt(maior.b)}${vm != null ? ` (${vm > 0 ? '+' : '−'}${fmtPct(Math.abs(vm))})` : ''}.`;
    }

    const grafico = (x, nat) => ({
      t: 'chart', x, y: 150, w: 300, h: 300, kind: 'col', title: nat.toUpperCase(), legend: true, labels: ['Operacional', 'Estratégica'],
      series: [{ name: String(pa.ano), values: ['Operacional', 'Estratégica'].map(t => conta(ant, nat, t)), color: COR.estr },
        { name: String(p.ano), values: ['Operacional', 'Estratégica'].map(t => conta(atual, nat, t)), color: COR.azul }]
    });
    const caixa = (y, rotulo, total, pct, cor) => [
      card(650, y, 285, 135),
      { t: 'text', x: 665, y: y + 12, w: 255, h: 20, size: 12, bold: true, color: COR.claro, paras: [para(rotulo)] },
      { t: 'text', x: 665, y: y + 36, w: 255, h: 52, size: 40, bold: true, color: cor, valign: 'middle', paras: [para(fmtInt(total))] },
      { t: 'text', x: 665, y: y + 96, w: 255, h: 22, size: 11, color: COR.claro, paras: [para(`**${fmtPct(pct)}** fechadas no período`)] }
    ];
    const els = [].concat(
      titulo(`COMPARATIVO DE VAGAS ABERTAS — ${pa.curto.toUpperCase()} × ${p.curto.toUpperCase()}`),
      { t: 'text', x: 40, y: 76, w: 830, h: 54, size: 11, color: COR.branco, paras: [para(texto)] },
      grafico(25, grupos[0]), grafico(335, grupos[1]),
      caixa(150, `Abertas/${yyA}`, ant.length, fechadasNoPeriodo(ant, pa), COR.estr),
      caixa(300, `Abertas/${yy}`, atual.length, fechadasNoPeriodo(atual, p), COR.valor)
    );
    const outras = nats.filter(n => !grupos.includes(n)).map(n => `${n}: ${conta(ant, n, 'Operacional') + conta(ant, n, 'Estratégica')} → ${conta(atual, n, 'Operacional') + conta(atual, n, 'Estratégica')}`);
    const notas = [
      `Vagas pela DATA DE ABERTURA: ${fmtData(pa.de)} a ${fmtData(pa.ate)} contra ${fmtData(p.de)} a ${fmtData(p.ate)}. Inclui canceladas e congeladas.`,
      '"Fechadas no período" = das vagas abertas no período, quantas foram finalizadas até o último dia dele.',
      outras.length ? 'Outras naturezas (ano anterior → atual): ' + outras.join('; ') + '.' : ''
    ].filter(Boolean).join('\n');
    return { id: 'rs-comparativo', nome: 'Comparativo de Vagas Abertas', fundo: 'conteudo', els, notas };
  }

  function slideAtivas(vagas, M, atualizadoEm) {
    const at = M.ativas(vagas);
    const coluna = (x, rotulo, g) => {
      const op = (g.porTipo.find(t => t.nome === 'Operacional') || { qtd: 0 }).qtd;
      const es = (g.porTipo.find(t => t.nome === 'Estratégica') || { qtd: 0 }).qtd;
      const nats = {};
      vagas.filter(v => v.status_vaga === (rotulo === 'EM ANDAMENTO' ? 'Andamento' : 'Aberta')).forEach(v => { const k = v.natureza || '(não informado)'; nats[k] = (nats[k] || 0) + 1; });
      const paras = [
        para(`${rotulo} — ${fmtInt(g.total)} vagas`, { run: { size: 16, bold: true, color: COR.azul }, spaceAfter: 4 }),
        para(`Atualmente estamos com **${fmtInt(g.total)} vagas ${rotulo === 'EM ANDAMENTO' ? 'em andamento' : 'em aberto'}**, sendo ${fmtInt(op)} Operacionais (${fmtPct(g.total ? op / g.total : null)}) e ${fmtInt(es)} Estratégicas (${fmtPct(g.total ? es / g.total : null)}).`, { spaceAfter: 8 })
      ];
      Object.entries(nats).sort((a, b) => b[1] - a[1]).forEach(([n, q]) => paras.push(para(`**${n}:** ${fmtInt(q)} ${q === 1 ? 'vaga' : 'vagas'}`, { bullet: true })));
      paras.push(para(g.porUnidade.map(u => `${u.nome} (${u.qtd})`).join(', ') + '.', { run: { italic: true, color: COR.suave, size: 10 }, spaceBefore: 8 }));
      paras.push(para(`Atualização – ${fmtData(atualizadoEm)}`, { run: { italic: true, color: COR.suave, size: 10 }, spaceBefore: 8 }));
      return [card(x, 100, 435, 390), { t: 'text', x: x + 18, y: 114, w: 400, h: 365, size: 12, color: COR.branco, paras }];
    };
    const els = [].concat(titulo('VAGAS EM ANDAMENTO E EM ABERTO'), coluna(25, 'EM ANDAMENTO', at.andamento), coluna(475, 'EM ABERTO', at.aberta));
    const notas = `Foto da planilha 18 no último upload (${fmtData(atualizadoEm)}), não do período escolhido. Congeladas hoje: ${fmtInt(at.congelada.total)}.`;
    return { id: 'rs-ativas', nome: 'Vagas em Andamento e em Aberto', fundo: 'conteudo', els, notas };
  }

  function slideProjecao(vagas, p, metas, M) {
    const ano = p.ano;
    const mensal = M.mensal(vagas, ano);
    const meta = mes => metas.find(m => m.ano === ano && m.mes === mes) || {};
    const temMeta = metas.some(m => m.ano === ano);
    const ate = p.m2;  // realizado só até o fim do período escolhido
    const real = campo => mensal.map(m => (m.mes <= ate ? m[campo] : null));
    const labels = MES3.slice();
    const grafico = (x, rotulo, campoMeta, campoReal) => ({
      t: 'chart', x, y: 125, w: 335, h: 340, kind: 'combo', legend: true, title: rotulo.toUpperCase(), labels,
      series: [{ name: rotulo + ' Projetado', values: mensal.map(m => (meta(m.mes)[campoMeta] == null ? 0 : meta(m.mes)[campoMeta])), color: COR.azul },
        { name: 'Realizado', values: real(campoReal), color: COR.laranja, line: true }]
    });

    const somaPer = campo => mensal.filter(m => m.mes >= p.m1 && m.mes <= p.m2).reduce((s, m) => s + m[campo], 0);
    const somaMeta = campo => { let s = 0, ok = false; for (let m = p.m1; m <= p.m2; m++) { const v = meta(m)[campo]; if (v != null) { s += v; ok = true; } } return ok ? s : null; };
    const ab = somaPer('abertas'), fe = somaPer('fechadas'), mAb = somaMeta('meta_abertas'), mFe = somaMeta('meta_fechadas');
    const acumAb = mensal.filter(m => m.mes <= ate).reduce((s, m) => s + m.abertas, 0);
    const acumFe = mensal.filter(m => m.mes <= ate).reduce((s, m) => s + m.fechadas, 0);
    const texto = temMeta
      ? `${cap(emPeriodo(p))}: abriram-se **${fmtInt(ab)} vagas** (${fmtPct(mAb ? ab / mAb : null)} da meta de ${fmtInt(mAb)}) e fecharam-se **${fmtInt(fe)}** (${fmtPct(mFe ? fe / mFe : null)} da meta de ${fmtInt(mFe)}).`
      : `Sem metas cadastradas para ${ano}. ${cap(emPeriodo(p))}: ${fmtInt(ab)} vagas abertas e ${fmtInt(fe)} fechadas.`;

    const insights = [para(`INSIGHTS — ${p.curto.toUpperCase()}`, { run: { bold: true, size: 11, color: COR.claro }, spaceAfter: 6 })];
    if (p.meses <= 2) {
      // Mês a mês (mensal e bimestral).
      for (let m = p.m1; m <= p.m2; m++) {
        const mm = mensal[m - 1], mt = meta(m);
        insights.push(para(`**${MESES[m - 1]}:** ${fmtInt(mm.abertas)} abertas${mt.meta_abertas != null ? ` (${fmtPct(mm.abertas / mt.meta_abertas)} da meta)` : ''} e ${fmtInt(mm.fechadas)} fechadas${mt.meta_fechadas != null ? ` (${fmtPct(mm.fechadas / mt.meta_fechadas)} da meta)` : ''}.`, { bullet: true, spaceAfter: 4 }));
      }
    } else {
      // Semestral/anual: melhor e pior mês de fechamento contra a meta.
      const comMeta = mensal.filter(m => m.mes >= p.m1 && m.mes <= Math.min(p.m2, ate) && meta(m.mes).meta_fechadas)
        .map(m => ({ m, r: m.fechadas / meta(m.mes).meta_fechadas })).sort((a, b) => b.r - a.r);
      if (comMeta.length) {
        const melhor = comMeta[0], pior = comMeta[comMeta.length - 1];
        insights.push(para(`**Melhor mês de fechamento:** ${MESES[melhor.m.mes - 1].toLowerCase()}, ${fmtInt(melhor.m.fechadas)} vagas (${fmtPct(melhor.r)} da meta).`, { bullet: true, spaceAfter: 4 }));
        insights.push(para(`**Mês mais abaixo da meta:** ${MESES[pior.m.mes - 1].toLowerCase()}, ${fmtInt(pior.m.fechadas)} vagas (${fmtPct(pior.r)} da meta).`, { bullet: true, spaceAfter: 4 }));
      }
    }
    insights.push(para(`**No ano até ${MES3[ate - 1].toLowerCase()}:** ${fmtInt(acumAb)} abertas e ${fmtInt(acumFe)} fechadas (saldo de ${acumAb - acumFe >= 0 ? '+' : '−'}${fmtInt(Math.abs(acumAb - acumFe))} vagas).`, { bullet: true }));

    const els = [].concat(
      titulo(`PROJEÇÃO DE VAGAS — ${ano}`),
      resumo(texto),
      grafico(25, 'Abertas', 'meta_abertas', 'abertas'),
      grafico(370, 'Fechadas', 'meta_fechadas', 'fechadas'),
      [card(718, 140, 222, 40 + 34 * (insights.length - 1)), { t: 'text', x: 732, y: 152, w: 196, h: 16 + 34 * (insights.length - 1), size: 10, color: COR.branco, paras: insights }]
    );
    const notas = 'Meta mensal: tabela metas_vagas (a de 2026 veio do slide "Projeção de Vagas" do Fechamento de Setembro). Realizado: abertas pela DATA DE ABERTURA e fechadas (status Finalizada) pela DATA DE FECHAMENTO, da planilha 18.';
    return { id: 'rs-projecao', nome: 'Projeção de Vagas', fundo: 'conteudo', els, notas };
  }

  // Deck do período. dados = { vagas, metas, atualizadoEm }.
  function montar(p, dados) {
    const M = window.HUB_METRICS_FECHAMENTO;
    const vagas = dados.vagas || [];
    return [
      slideCapa(p),
      slideDivisor('rs-divisor', 'RECRUTAMENTO E', 'SELEÇÃO'),
      slideVagasFinalizadas(vagas, p, M),
      slideComparativo(vagas, p),
      slideAtivas(vagas, M, dados.atualizadoEm),
      slideProjecao(vagas, p, dados.metas || [], M)
    ];
  }

  window.HUB_FECHAMENTO_SLIDES = { COR, MESES, TIPOS, periodo, mesmoPeriodoAnoAnterior, montar, _internal: { runs, naturezaPrincipal, fmtPct } };
})();
