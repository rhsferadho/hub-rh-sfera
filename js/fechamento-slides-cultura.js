// Fechamento do Período — Cultura e Reconhecimento, Pesquisa de Engajamento e
// Treinamento e Desenvolvimento. Os números vêm do mesmo cálculo mensal do
// Boletim da Liderança (HUB_METRICS_BOLETIM.calcularMes), que já junta Feedz
// (celebrações, feedbacks, humor), Pesquisa de Engajamento (notas, pilares,
// eNPS), Twygo e os valores manuais (Unibê, Academia Hering).
//
// cult.mes('AAAA-MM') → resultado de calcularMes (empresa.ind e operacoes[id]).
// cult.OPERACOES → lista de operações do Boletim ({ id, nome }).
// Período com vários meses: taxas e notas são a média dos meses; contagens, a soma.
(function () {
  const S = () => window.HUB_FECHAMENTO_SLIDES;
  const pad = n => String(n).padStart(2, '0');
  const mesesDe = p => { const out = []; for (let m = p.m1; m <= p.m2; m++) out.push(`${p.ano}-${pad(m)}`); return out; };
  const mesesAte = (ano, m2, qtd) => { const out = []; let a = ano, m = m2; for (let i = 0; i < qtd; i++) { out.unshift(`${a}-${pad(m)}`); m--; if (!m) { m = 12; a--; } } return out; };
  const MES3 = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const rotMes = mk => `${MES3[+mk.slice(5, 7) - 1]}/${mk.slice(2, 4)}`;
  const media = a => { const v = a.filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const soma = a => { const v = a.filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((s, x) => s + x, 0) : null; };
  const fmtNota = v => (v == null ? '—' : v.toFixed(1).replace('.', ','));
  const sinal = v => (v == null ? '—' : (v > 0 ? '+' : '') + Math.round(v));

  // Valor de um indicador no período: da empresa (opId null) ou de uma operação.
  function valor(cult, meses, id, opId, agregar) {
    const vals = meses.map(mk => { const c = cult.mes(mk); const alvo = opId ? c.operacoes[opId] : c.empresa; return alvo && alvo.ind ? alvo.ind[id] : null; });
    return (agregar || media)(vals);
  }
  function pilares(cult, meses, opId) {
    const acc = {};
    meses.forEach(mk => { const c = cult.mes(mk); const alvo = opId ? c.operacoes[opId] : c.empresa; const pl = (alvo && alvo.ind && alvo.ind.pilares) || {}; Object.entries(pl).forEach(([k, v]) => { (acc[k] = acc[k] || []).push(v); }); });
    const out = {}; Object.entries(acc).forEach(([k, v]) => { out[k] = media(v); });
    return out;
  }
  const doAno = p => { const out = []; for (let m = 1; m <= p.m2; m++) out.push(`${p.ano}-${pad(m)}`); return out; };

  // ------------------------------------------------------------------
  function slideCultura(p, cult) {
    const { COR, para, titulo, card, kpi, fmtInt, fmtPct, pp } = S().pecas;
    const pa = S().mesmoPeriodoAnoAnterior(p);
    const ms = mesesDe(p), msA = mesesDe(pa);
    const cel = valor(cult, ms, 'celebracoes', null, soma), celA = valor(cult, msA, 'celebracoes', null, soma);
    const fb = valor(cult, ms, 'feedback_painel'), fbA = valor(cult, msA, 'feedback_painel');
    const hum = valor(cult, ms, 'humor_media'), humPart = valor(cult, ms, 'humor_participacao');
    const eng = valor(cult, ms, 'engajamento_feedz'), engA = valor(cult, msA, 'engajamento_feedz');
    const janela = mesesAte(p.ano, p.m2, Math.max(6, p.meses));
    const serie = id => janela.map(mk => { const c = cult.mes(mk); return c.empresa.ind[id] == null ? null : c.empresa.ind[id]; });
    const ops = cult.OPERACOES.map(o => ({ nome: o.nome, v: valor(cult, ms, 'engajamento_feedz', o.id) })).filter(o => o.v != null).sort((a, b) => b.v - a.v);

    const els = [].concat(
      titulo(`CULTURA E RECONHECIMENTO — ${p.label.toUpperCase()}`),
      { t: 'text', x: 40, y: 76, w: 830, h: 20, size: 11, color: COR.branco, paras: [para(`Uso da Feedz pela liderança e pelos colaboradores ${S().pecas.emPeriodo(p)}: celebrações, feedbacks, termômetro de humor e engajamento.`)] },
      kpi(25, 105, 220, 95, 'CELEBRAÇÕES DE GESTORES', fmtInt(cel), `${fmtInt(celA)} em ${pa.curto}`, COR.valor),
      kpi(255, 105, 220, 95, 'ADESÃO AOS FEEDBACKS', fmtPct(fb), `${fmtPct(fbA)} em ${pa.curto}` + (pp(fb, fbA) ? ` (${pp(fb, fbA)})` : ''), COR.valor),
      kpi(485, 105, 220, 95, 'TERMÔMETRO DE HUMOR', `${fmtNota(hum)} / 5`, `${fmtPct(humPart)} registraram o humor`, COR.amarelo),
      kpi(715, 105, 220, 95, 'ENGAJAMENTO NA FEEDZ', fmtPct(eng), `${fmtPct(engA)} em ${pa.curto}` + (pp(eng, engA) ? ` (${pp(eng, engA)})` : ''), '2EC4A0'),
      [card(25, 210, 450, 280)],
      { t: 'chart', x: 35, y: 216, w: 430, h: 268, kind: 'col', fmt: 'pct0', legend: true, labelSize: 7.5, title: 'EVOLUÇÃO MENSAL',
        labels: janela.map(rotMes),
        series: [{ name: 'Adesão aos feedbacks', values: serie('feedback_painel'), color: '2E75B6' }, { name: 'Registro de humor', values: serie('humor_participacao'), color: 'F2B84B' }, { name: 'Engajamento Feedz', values: serie('engajamento_feedz'), color: '2EC4A0' }] },
      [card(485, 210, 450, 280)],
      { t: 'chart', x: 495, y: 216, w: 430, h: 268, kind: 'bar', fmt: 'pct0', catSize: 8.5, title: 'ENGAJAMENTO NA FEEDZ POR OPERAÇÃO',
        labels: ops.map(o => o.nome), series: [{ name: 'Engajamento', values: ops.map(o => o.v), color: '2EC4A0' }] }
    );
    const notas = 'Mesmas contas do Boletim da Liderança. Celebrações = celebrações feitas por gestores (soma do período). Adesão aos feedbacks = % de liderados que receberam feedback (no Escritório, feedback ou 1:1). Humor = nota média do Termômetro (1 a 5) e % de colaboradores que registraram. Engajamento na Feedz = índice do Boletim (média dos componentes disponíveis). Período de vários meses: média dos meses.';
    return { id: 'cult-cultura', nome: 'Cultura e Reconhecimento', fundo: 'conteudo', els, notas };
  }

  // ------------------------------------------------------------------
  function slideEngajamento(p, cult) {
    const { COR, para, titulo, card, fmtInt, fmtPct } = S().pecas;
    const ms = mesesDe(p), ano = doAno(p);
    const nota = valor(cult, ms, 'pesquisa_nota'), notaAno = valor(cult, ano, 'pesquisa_nota');
    const part = valor(cult, ms, 'pesquisa_participacao'), partAno = valor(cult, ano, 'pesquisa_participacao');
    const nps = valor(cult, ms, 'nps'), npsN = valor(cult, ms, 'nps_respostas', null, soma);
    const pl = pilares(cult, ms), plAno = pilares(cult, ano);
    const nomes = Object.keys(pl).sort((a, b) => (pl[b] || 0) - (pl[a] || 0));
    const ops = cult.OPERACOES.map(o => ({ nome: o.nome, v: valor(cult, ms, 'pesquisa_nota', o.id) })).filter(o => o.v != null).sort((a, b) => b.v - a.v);
    const melhor = nomes[0], pior = nomes[nomes.length - 1];

    const box = (x, rotulo, valorTxt, sub, cor) => [
      card(x, 105, 295, 90),
      { t: 'text', x: x + 14, y: 112, w: 268, h: 16, size: 10, bold: true, color: COR.claro, paras: [para(rotulo)] },
      { t: 'text', x: x + 14, y: 130, w: 268, h: 38, size: 28, bold: true, color: cor, valign: 'middle', paras: [para(valorTxt)] },
      { t: 'text', x: x + 14, y: 170, w: 268, h: 18, size: 9, color: COR.suave, paras: [para(sub)] }
    ];
    const els = [].concat(
      titulo(`PESQUISA DE ENGAJAMENTO — ${p.label.toUpperCase()}`),
      { t: 'text', x: 40, y: 76, w: 830, h: 20, size: 11, color: COR.branco, paras: [para(nomes.length
        ? `**${melhor}** é o pilar mais bem avaliado (${fmtNota(pl[melhor])}); **${pior}**, o que mais pede atenção (${fmtNota(pl[pior])}).`
        : `Sem respostas da pesquisa ${S().pecas.emPeriodo(p)}.`)] },
      box(25, 'NOTA MÉDIA (1 A 5)', fmtNota(nota), `acumulado ${p.ano}: ${fmtNota(notaAno)}`, COR.amarelo),
      box(332, 'PARTICIPAÇÃO', fmtPct(part), `meta 60% · acumulado ${p.ano}: ${fmtPct(partAno)}`, '2EC4A0'),
      box(640, 'eNPS', sinal(nps), npsN ? `${fmtInt(npsN)} respostas · escala −100 a +100` : 'sem respostas de NPS', COR.valor),
      [card(25, 205, 450, 285)],
      { t: 'chart', x: 35, y: 211, w: 430, h: 273, kind: 'bar', fmt: 'dec1', legend: true, catSize: 8.5, labelSize: 8, title: 'NOTA POR PILAR',
        labels: nomes, series: [{ name: p.curto, values: nomes.map(k => pl[k]), color: 'F2B84B' }, { name: `Acumulado ${p.ano}`, values: nomes.map(k => plAno[k]), color: '8EA3CF' }] },
      [card(485, 205, 450, 285)],
      { t: 'chart', x: 495, y: 211, w: 430, h: 273, kind: 'bar', fmt: 'dec1', catSize: 8.5, title: 'NOTA POR OPERAÇÃO',
        labels: ops.map(o => o.nome), series: [{ name: 'Nota', values: ops.map(o => o.v), color: '2E75B6' }] }
    );
    const notas = 'Mesmas contas do Boletim da Liderança: notas da Pesquisa de Engajamento (escala 1 a 5) por pilar, participação (respondentes ÷ convidados) e eNPS. Período de vários meses e acumulado do ano: média das médias mensais.';
    return { id: 'cult-engajamento', nome: 'Pesquisa de Engajamento', fundo: 'conteudo', els, notas };
  }

  // ------------------------------------------------------------------
  // T&D — Twygo (foto do último mês do período) e valores manuais.
  function slideTwygo(p, cult) {
    const { COR, para, titulo, card, fmtInt, fmtPct } = S().pecas;
    const ult = `${p.ano}-${pad(p.m2)}`;
    const c = cult.mes(ult);
    const geral = c.empresa.ind.twygo_progresso, pessoas = c.empresa.base && c.empresa.base.twygo_pessoas;
    const ops = cult.OPERACOES.map(o => ({ nome: o.nome, v: c.operacoes[o.id] && c.operacoes[o.id].ind.twygo_progresso })).filter(o => o.v != null).sort((a, b) => b.v - a.v);
    const lojas = [];
    cult.OPERACOES.forEach(o => ((c.operacoes[o.id] || {}).lojas || []).forEach(l => {
      if (!l.apoio && l.ind && l.ind.twygo_progresso != null && l.base && l.base.twygo_pessoas >= 3) lojas.push({ nome: l.nome || l.departamento, v: l.ind.twygo_progresso });
    }));
    lojas.sort((a, b) => b.v - a.v);
    const top = lojas.slice(0, 10), fundo = lojas.slice(-10).reverse();

    const els = [].concat(
      titulo('STATUS DE TREINAMENTOS — TWYGO'),
      { t: 'text', x: 40, y: 76, w: 830, h: 20, size: 11, color: COR.branco, paras: [para(`Progresso médio nas trilhas da Twygo em ${S().MESES[p.m2 - 1].toLowerCase()} ${p.ano}: **${fmtPct(geral)}**${pessoas ? ` entre ${fmtInt(pessoas)} colaboradores` : ''}.`)] },
      [card(25, 105, 300, 385)],
      { t: 'chart', x: 35, y: 111, w: 280, h: 373, kind: 'bar', fmt: 'pct0', catSize: 8.5, title: 'POR OPERAÇÃO', labels: ops.map(o => o.nome), series: [{ name: 'Progresso', values: ops.map(o => o.v), color: '2E75B6' }] },
      [card(335, 105, 295, 385)],
      { t: 'chart', x: 345, y: 111, w: 275, h: 373, kind: 'bar', fmt: 'pct0', catSize: 8, labelSize: 8, title: 'TOP 10 — MAIOR PROGRESSO', labels: top.map(l => l.nome), series: [{ name: 'Progresso', values: top.map(l => l.v), color: '2EC4A0' }] },
      [card(640, 105, 295, 385)],
      { t: 'chart', x: 650, y: 111, w: 275, h: 373, kind: 'bar', fmt: 'pct0', catSize: 8, labelSize: 8, title: 'TOP 10 — MENOR PROGRESSO', labels: fundo.map(l => l.nome), series: [{ name: 'Progresso', values: fundo.map(l => l.v), color: 'E8604C' }] }
    );
    const notas = 'Mesma conta do Boletim da Liderança: progresso médio das inscrições da Twygo (planilha 27). É uma foto do último upload, não um histórico mês a mês. Lojas: só as com 3 ou mais colaboradores inscritos, sem as áreas de apoio.';
    return { id: 'td-twygo', nome: 'Status de Treinamentos — Twygo', fundo: 'conteudo', els, notas };
  }

  function slideParceiras(p, cult) {
    const { COR, para, titulo, card, fmtInt, fmtPct } = S().pecas;
    const ms = mesesDe(p);
    // Último valor lançado no período (os lançamentos são mensais).
    const ultimo = (id, opId) => { for (let i = ms.length - 1; i >= 0; i--) { const c = cult.mes(ms[i]); const a = opId ? c.operacoes[opId] : c.empresa; const v = a && a.ind ? a.ind[id] : null; if (v != null) return v; } return null; };
    const unibe = cult.OPERACOES.map(o => ({ nome: o.nome, v: ultimo('unibe_adesao', o.id) })).filter(o => o.v != null).sort((a, b) => b.v - a.v);
    const academia = ultimo('academia_pontos', 'hering');
    const unibeMedia = media(unibe.map(o => o.v));
    const vazio = !unibe.length && academia == null;
    const els = [].concat(
      titulo('PLATAFORMAS PARCEIRAS — UNIBÊ E ACADEMIA HERING'),
      { t: 'text', x: 40, y: 76, w: 830, h: 20, size: 11, color: COR.branco, paras: [para(vazio
        ? 'Sem valores lançados no período. Preencha em Boletim da Liderança → Valores manuais (Unibê e Academia Hering).'
        : `Valores lançados no Boletim da Liderança para ${p.label.toLowerCase()}.`)] },
      [card(25, 105, 600, 385)],
      unibe.length
        ? { t: 'chart', x: 35, y: 111, w: 580, h: 373, kind: 'bar', fmt: 'pct0', catSize: 9, title: 'UNIBÊ — ADESÃO POR OPERAÇÃO', labels: unibe.map(o => o.nome), series: [{ name: 'Adesão', values: unibe.map(o => o.v), color: 'B45CD6' }] }
        : { t: 'text', x: 45, y: 120, w: 560, h: 40, size: 11, color: COR.suave, paras: [para('**UNIBÊ** — sem adesão lançada no período.')] },
      [card(640, 105, 295, 185),
        { t: 'text', x: 655, y: 115, w: 265, h: 18, size: 10.5, bold: true, color: COR.claro, paras: [para('UNIBÊ — MÉDIA DAS OPERAÇÕES')] },
        { t: 'text', x: 655, y: 140, w: 265, h: 60, size: 40, bold: true, color: 'D99BF0', valign: 'middle', paras: [para(fmtPct(unibeMedia))] },
        { t: 'text', x: 655, y: 210, w: 265, h: 70, size: 9.5, color: COR.suave, paras: [para('meta do Boletim: 90%')] }],
      [card(640, 300, 295, 190),
        { t: 'text', x: 655, y: 310, w: 265, h: 18, size: 10.5, bold: true, color: COR.claro, paras: [para('ACADEMIA HERING')] },
        { t: 'text', x: 655, y: 335, w: 265, h: 60, size: 40, bold: true, color: COR.amarelo, valign: 'middle', paras: [para(academia == null ? '—' : fmtInt(academia))] },
        { t: 'text', x: 655, y: 405, w: 265, h: 70, size: 9.5, color: COR.suave, paras: [para('pontos (média das lojas Hering)')] }]
    );
    const notas = 'Valores manuais do Boletim da Liderança (Unibê — adesão por operação; Academia Hering — pontos). Usa o último mês do período com valor lançado.';
    return { id: 'td-parceiras', nome: 'Unibê e Academia Hering', fundo: 'conteudo', els, notas };
  }

  window.HUB_FECHAMENTO_CULTURA = {
    cultura: (p, cult) => [slideCultura(p, cult), slideEngajamento(p, cult)],
    td: (p, cult) => [slideTwygo(p, cult), slideParceiras(p, cult)],
    _internal: { mesesDe, mesesAte, valor, pilares }
  };
})();
