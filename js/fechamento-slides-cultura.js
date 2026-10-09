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
  // Pesquisa de Engajamento no período, direto das bases da planilha 33 (não do
  // cálculo mensal do Boletim, que usa UM pulso por mês e só tem a base de
  // convidados no pulso mais recente):
  //   participação → total oficial de cada pulso que COMEÇA no período (aba
  //                  Adesão): soma dos respondentes ÷ soma dos convidados;
  //   notas/eNPS   → todas as respostas do período (notas diárias agregadas por
  //                  loja e pilar, tabela engajamento_notas).
  // cult.engajamento = { pulsos, notas, operacaoDe }.
  const PILAR_NPS = 'NPS';
  function engajamentoDe(cult, de, ate) {
    const E = cult.engajamento;
    if (!E) return null;
    const ps = (E.pulsos || []).filter(x => x.inicio >= de && x.inicio <= ate && x.convidados);
    const resp = ps.reduce((s, x) => s + (Number(x.respondentes) || 0), 0), conv = ps.reduce((s, x) => s + (Number(x.convidados) || 0), 0);
    const pl = {}, porOp = {};
    let s = 0, n = 0, npsN = 0, prom = 0, det = 0;
    // Notas na mesma janela da participação: respostas dos pulsos que começaram
    // no período, até 1 dia depois do fim de cada um (mesma tolerância da
    // planilha 33). Sem pulso no período, valem as datas do período.
    const umDia = iso => new Date(Date.parse(iso + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
    const janelas = (E.pulsos || []).filter(x => x.inicio >= de && x.inicio <= ate).map(x => [x.inicio, umDia(x.fim || x.inicio)]);
    const dentro = dia => (janelas.length ? janelas.some(([a, b]) => dia >= a && dia <= b) : dia >= de && dia <= ate);
    for (const r of E.notas || []) {
      const dia = String(r.dia || '').slice(0, 10);
      if (!dentro(dia)) continue;
      if (r.dimensao === PILAR_NPS) { npsN += +r.n || 0; prom += +r.promotores || 0; det += +r.detratores || 0; continue; }
      const a = pl[r.dimensao] = pl[r.dimensao] || { s: 0, n: 0 };
      a.s += +r.soma || 0; a.n += +r.n || 0;
      s += +r.soma || 0; n += +r.n || 0;
      const op = E.operacaoDe ? E.operacaoDe(r.unidade, r.departamento) : null;
      if (op) { const o = porOp[op] = porOp[op] || { s: 0, n: 0 }; o.s += +r.soma || 0; o.n += +r.n || 0; }
    }
    const medias = obj => Object.fromEntries(Object.entries(obj).filter(([, a]) => a.n).map(([k, a]) => [k, a.s / a.n]));
    return {
      pulsos: ps.length, respondentes: resp, convidados: conv, participacao: conv ? resp / conv : null,
      nota: n ? s / n : null, pilares: medias(pl), porOperacao: medias(porOp),
      nps: npsN ? Math.round((prom - det) / npsN * 100) : null, npsN
    };
  }

  function slideEngajamento(p, cult) {
    const { COR, para, titulo, card, fmtInt, fmtPct } = S().pecas;
    const ms = mesesDe(p), ano = doAno(p);
    const e = engajamentoDe(cult, p.de, p.ate), eAno = engajamentoDe(cult, `${p.ano}-01-01`, p.ate);
    // Sem as bases da pesquisa (ex.: testes), cai no cálculo mensal do Boletim.
    const nota = e ? e.nota : valor(cult, ms, 'pesquisa_nota'), notaAno = eAno ? eAno.nota : valor(cult, ano, 'pesquisa_nota');
    const part = e ? e.participacao : valor(cult, ms, 'pesquisa_participacao'), partAno = eAno ? eAno.participacao : valor(cult, ano, 'pesquisa_participacao');
    const nps = e ? e.nps : valor(cult, ms, 'nps'), npsN = e ? e.npsN : valor(cult, ms, 'nps_respostas', null, soma);
    const pl = e ? e.pilares : pilares(cult, ms), plAno = eAno ? eAno.pilares : pilares(cult, ano);
    const nomes = Object.keys(pl).sort((a, b) => (pl[b] || 0) - (pl[a] || 0));
    const ops = cult.OPERACOES.map(o => ({ nome: o.nome, v: e ? e.porOperacao[o.id] : valor(cult, ms, 'pesquisa_nota', o.id) })).filter(o => o.v != null).sort((a, b) => b.v - a.v);
    const melhor = nomes[0], pior = nomes[nomes.length - 1];
    const subPart = e
      ? (e.pulsos ? `${fmtInt(e.respondentes)} de ${fmtInt(e.convidados)} · ${e.pulsos} ${e.pulsos === 1 ? 'pulso' : 'pulsos'} · acum. ${p.ano}: ${fmtPct(partAno)}` : `nenhum pulso começou no período · acum. ${p.ano}: ${fmtPct(partAno)}`)
      : `meta 60% · acumulado ${p.ano}: ${fmtPct(partAno)}`;

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
      box(332, 'PARTICIPAÇÃO (META 60%)', fmtPct(part, 1), subPart, part != null && part >= 0.6 ? '2EC4A0' : COR.amarelo),
      box(640, 'eNPS', sinal(nps), npsN ? `${fmtInt(npsN)} respostas · escala −100 a +100` : 'sem respostas de NPS', COR.valor),
      [card(25, 205, 450, 285)],
      { t: 'chart', x: 35, y: 211, w: 430, h: 273, kind: 'bar', fmt: 'dec1', legend: true, catSize: 8.5, labelSize: 8, title: 'NOTA POR PILAR',
        labels: nomes, series: [{ name: p.curto, values: nomes.map(k => pl[k]), color: 'F2B84B' }, { name: `Acumulado ${p.ano}`, values: nomes.map(k => plAno[k]), color: '8EA3CF' }] },
      [card(485, 205, 450, 285)],
      { t: 'chart', x: 495, y: 211, w: 430, h: 273, kind: 'bar', fmt: 'dec1', catSize: 8.5, title: 'NOTA POR OPERAÇÃO',
        labels: ops.map(o => o.nome), series: [{ name: 'Nota', values: ops.map(o => o.v), color: '2E75B6' }] }
    );
    const notas = 'Fonte: planilha 33 (Pesquisa de Engajamento). Participação: total oficial de cada pulso que começou no período (aba Adesão), respondentes ÷ convidados somados. Notas (1 a 5), pilares e eNPS: respostas desses mesmos pulsos (até 1 dia depois do fim de cada um). Nota por operação: lojas agrupadas como no Boletim da Liderança.';
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

  // ------------------------------------------------------------------
  // Feedbacks: volume do período, cobertura por unidade e série mensal do ano.
  // cult.feedbacks = linhas da planilha 4; cult.headcount(ate) = { unidade: ativos }.
  const unidadeCurta = u => String(u || 'Não informado').replace(/^Botic[aá]rio VD - /, 'Bot. VD ').replace(/^Botic[aá]rio - /, 'Bot. ').replace('Quem disse, Berenice?', 'QDB');
  function slideFeedbacks(p, cult) {
    const { COR, para, titulo, card, fmtInt, fmtPct } = S().pecas;
    const fb = cult.feedbacks || [];
    const noPer = (de, ate) => fb.filter(r => { const d = String(r.data || '').slice(0, 10); return d >= de && d <= ate; });
    const pAnt = (() => { const d = new Date(Date.UTC(p.ano, p.m1 - 1 - p.meses, 1)); const de = d.toISOString().slice(0, 10); const ate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + p.meses, 0)).toISOString().slice(0, 10); return { de, ate }; })();
    const atual = noPer(p.de, p.ate), ant = noPer(pAnt.de, pAnt.ate);
    const hc = cult.headcount ? cult.headcount(p.ate) : {};
    const hcTotal = Object.values(hc).reduce((s, x) => s + x, 0);
    const porUni = {};
    atual.forEach(r => { const k = r.unidade || 'Não informado'; const o = porUni[k] = porUni[k] || { n: 0, pessoas: new Set() }; o.n++; if (r.para) o.pessoas.add(String(r.para).trim().toLowerCase()); });
    const lista = Object.entries(porUni).map(([u, o]) => ({ u, n: o.n, cob: hc[u] ? Math.min(o.pessoas.size / hc[u], 1) : null })).sort((a, b) => b.n - a.n);
    const pessoas = new Set(atual.map(r => String(r.para || '').trim().toLowerCase()).filter(Boolean)).size;
    const cobGeral = hcTotal ? pessoas / hcTotal : null;
    const piores = lista.filter(x => x.cob != null).sort((a, b) => a.cob - b.cob).slice(0, 2);
    const v = ant.length ? (atual.length - ant.length) / ant.length : null;
    const meses = []; for (let m = 1; m <= p.m2; m++) meses.push(`${p.ano}-${pad(m)}`);
    const texto = `${S().pecas.cap(S().pecas.emPeriodo(p))}, **${fmtInt(atual.length)} feedbacks** registrados${v == null ? '' : ` (${v >= 0 ? '+' : '−'}${fmtPct(Math.abs(v))} vs período anterior)`}; **${fmtPct(cobGeral)} do quadro** recebeu feedback${piores.length ? `; menores coberturas: ${piores.map(x => `${unidadeCurta(x.u)} (${fmtPct(x.cob)})`).join(' e ')}` : ''}.`;
    const linhas = lista.slice(0, 11);
    const els = [].concat(
      titulo(`FEEDBACKS — ${p.label.toUpperCase()}`),
      { t: 'text', x: 40, y: 76, w: 830, h: 20, size: 11, color: COR.branco, paras: [para(texto)] },
      card(25, 105, 300, 90),
      { t: 'text', x: 40, y: 113, w: 270, h: 46, size: 34, bold: true, color: '2BB3FF', valign: 'middle', paras: [para(fmtInt(atual.length))] },
      { t: 'text', x: 40, y: 162, w: 270, h: 28, size: 9.5, color: COR.suave, paras: [para(`feedbacks registrados · ${fmtInt(pessoas)} pessoas receberam`)] },
      card(25, 205, 300, 285),
      { t: 'text', x: 40, y: 213, w: 270, h: 16, size: 9.5, bold: true, color: '5CE1E6', paras: [para('VOLUME E COBERTURA POR UNIDADE')] },
      linhas.map((x, i) => [
        { t: 'text', x: 40, y: 235 + i * 22.5, w: 190, h: 18, size: 9.5, color: COR.branco, valign: 'middle', paras: [para(unidadeCurta(x.u))] },
        { t: 'text', x: 230, y: 235 + i * 22.5, w: 85, h: 18, size: 9.5, bold: true, color: COR.branco, align: 'right', valign: 'middle', paras: [para(`${fmtInt(x.n)} – ${fmtPct(x.cob)}`)] }
      ]).flat(),
      [card(340, 105, 595, 385)],
      { t: 'chart', x: 350, y: 111, w: 575, h: 373, kind: 'col', title: 'VOLUME MENSAL', labels: meses.map(rotMes), series: [{ name: 'Feedbacks', values: meses.map(mk => noPer(`${mk}-01`, `${mk}-31`).length), color: '5B9BD5' }] }
    );
    const notas = `Fonte: planilha 4. Feedbacks — registros com data ${S().pecas.emPeriodo(p)} (${fmtInt(atual.length)}). Cobertura = pessoas distintas que receberam feedback ÷ headcount ativo da unidade em ${p.ate.split('-').reverse().join('/')} (planilha 1. Colaboradores).`;
    return { id: 'cult-feedbacks', nome: 'Feedbacks', fundo: 'conteudo', els, notas };
  }

  // ------------------------------------------------------------------
  // Termômetro de Humor: média geral, por unidade e departamentos extremos.
  // cult.humor = humor_mensal (mês × loja: registros, soma, pessoas).
  function slideHumor(p, cult) {
    const { COR, para, titulo, card, fmtInt } = S().pecas;
    const rows = (cult.humor || []).filter(r => { const m = String(r.mes || '').slice(0, 7); return m >= p.de.slice(0, 7) && m <= p.ate.slice(0, 7); });
    const agrupar = chave => { const g = {}; rows.forEach(r => { const k = chave(r); if (!k) return; const o = g[k] = g[k] || { s: 0, n: 0 }; o.s += +r.soma || 0; o.n += +r.registros || 0; }); return Object.entries(g).filter(([, o]) => o.n).map(([k, o]) => ({ k, media: o.s / o.n, n: o.n })); };
    const somaS = rows.reduce((s, r) => s + (+r.soma || 0), 0), somaN = rows.reduce((s, r) => s + (+r.registros || 0), 0);
    const media = somaN ? somaS / somaN : null;
    const pessoas = rows.reduce((s, r) => s + (+r.pessoas || 0), 0);
    const uni = agrupar(r => r.unidade).sort((a, b) => b.media - a.media);
    const dep = agrupar(r => r.departamento).filter(d => d.n >= 10);
    const alta = dep.slice().sort((a, b) => b.media - a.media).slice(0, 10), baixa = dep.slice().sort((a, b) => a.media - b.media).slice(0, 10);
    const rotulo = media == null ? '' : (cult.rotuloHumor ? cult.rotuloHumor(media) : '');
    const curtoDep = d => String(d).replace(/^O Botic[aá]rio\s+/i, 'Bot. ');
    const els = [].concat(
      titulo(`TERMÔMETRO DE HUMOR — ${p.label.toUpperCase()}`),
      { t: 'text', x: 40, y: 76, w: 830, h: 20, size: 11, color: COR.branco, paras: [para(media == null ? `Sem registros de humor ${S().pecas.emPeriodo(p)}.` : `Média Sfera **${fmtNota(media)}${rotulo ? ' — ' + rotulo.toUpperCase() : ''}** em ${fmtInt(somaN)} registros${uni.length ? `; maior média em ${unidadeCurta(uni[0].k)} (${fmtNota(uni[0].media)}), menor em ${unidadeCurta(uni[uni.length - 1].k)} (${fmtNota(uni[uni.length - 1].media)})` : ''}.`)] },
      [card(25, 105, 390, 385)],
      { t: 'chart', x: 35, y: 111, w: 370, h: 373, kind: 'bar', fmt: 'dec1', catSize: 8, labelSize: 8, title: 'MÉDIA DE HUMOR POR UNIDADE', labels: uni.map(u => unidadeCurta(u.k)), series: [{ name: 'Média', values: uni.map(u => u.media), color: '2E75B6' }] },
      [card(425, 105, 510, 188)],
      { t: 'chart', x: 435, y: 109, w: 490, h: 180, kind: 'col', fmt: 'dec1', catSize: 7, labelSize: 7.5, title: '10 MAIORES MÉDIAS (10+ REGISTROS)', labels: alta.map(d => curtoDep(d.k)), series: [{ name: 'Média', values: alta.map(d => d.media), color: '2BB3FF' }] },
      [card(425, 302, 510, 188)],
      { t: 'chart', x: 435, y: 306, w: 490, h: 180, kind: 'col', fmt: 'dec1', catSize: 7, labelSize: 7.5, title: '10 MENORES MÉDIAS (10+ REGISTROS)', labels: baixa.map(d => curtoDep(d.k)), series: [{ name: 'Média', values: baixa.map(d => d.media), color: 'F5B800' }] }
    );
    const notas = `Fonte: planilha 36. Humor (agregada por mês e loja). Média = soma das notas ÷ registros ${S().pecas.emPeriodo(p)} (${fmtInt(somaN)} registros). Ranking de departamentos só com 10 ou mais registros no período. Régua: 1–1,99 muito triste · 2–2,99 triste · 3–3,99 neutro · 4–4,99 feliz · 5 muito feliz.`;
    return { id: 'cult-humor', nome: 'Termômetro de Humor', fundo: 'conteudo', els, notas };
  }

  // ------------------------------------------------------------------
  // Pesquisa de Satisfação com as áreas de suporte (planilha 16). A pesquisa
  // aplicada no mês M avalia o mês M-1: no fechamento de setembro entra a
  // pesquisa aplicada em setembro (sobre agosto).
  // cult.satisfacao = { respostas: [{ pesquisa, area, nota }], ciclos: [{ pesquisa, respondentes, aptos }] }.
  function slideSatisfacao(p, cult) {
    const { COR, para, titulo, card, fmtInt, fmtPct } = S().pecas;
    const sat = cult.satisfacao;
    if (!sat) return null;
    const mesDe = r => String(r.pesquisa || '').slice(0, 7);
    const ciclosPer = (sat.ciclos || []).filter(c => mesDe(c) >= p.de.slice(0, 7) && mesDe(c) <= p.ate.slice(0, 7));
    if (!ciclosPer.length) return null;
    const ult = ciclosPer[ciclosPer.length - 1];
    const idx = (sat.ciclos || []).findIndex(c => c.pesquisa === ult.pesquisa);
    const ant = idx > 0 ? sat.ciclos[idx - 1] : null;
    const notasDe = mes => (sat.respostas || []).filter(r => mesDe(r) === mes && r.nota != null);
    const porArea = lista => { const g = {}; lista.forEach(r => { const o = g[r.area] = g[r.area] || { s: 0, n: 0 }; o.s += +r.nota; o.n++; }); return Object.fromEntries(Object.entries(g).map(([k, o]) => [k, o.s / o.n])); };
    const nAt = notasDe(mesDe(ult)), nAnt = ant ? notasDe(mesDe(ant)) : [];
    const mediaDe = l => (l.length ? l.reduce((s, r) => s + +r.nota, 0) / l.length : null);
    const mAt = mediaDe(nAt), mAnt = mediaDe(nAnt);
    const aAt = porArea(nAt), aAnt = porArea(nAnt);
    const areas = Object.keys(aAt).sort((a, b) => aAt[b] - aAt[a]);
    const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const rot = mk => `${MES[+mk.slice(5, 7) - 1]}/${mk.slice(2, 4)}`;
    const refDe = mk => { const d = new Date(Date.UTC(+mk.slice(0, 4), +mk.slice(5, 7) - 2, 1)); return `${MES[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`; };
    const maior = areas[0], menor = areas[areas.length - 1];
    const quedas = areas.map(a => ({ a, d: aAnt[a] != null ? aAt[a] - aAnt[a] : null })).filter(x => x.d != null).sort((x, y) => x.d - y.d);
    const fmt2 = v => (v == null ? '—' : v.toFixed(2).replace('.', ','));
    const box = (y, rotulo, valor, sub) => [card(25, y, 220, 88),
      { t: 'text', x: 37, y: y + 8, w: 196, h: 14, size: 8, color: COR.claro, paras: [para(rotulo)] },
      { t: 'text', x: 37, y: y + 24, w: 196, h: 34, size: 24, bold: true, color: COR.branco, valign: 'middle', paras: [para(valor)] },
      { t: 'text', x: 37, y: y + 62, w: 196, h: 20, size: 8.5, color: '6FA8FF', paras: [para(sub)] }];
    const els = [].concat(
      titulo(`SATISFAÇÃO COM ÁREAS DE SUPORTE — ${rot(mesDe(ult)).toUpperCase()}`),
      { t: 'text', x: 40, y: 76, w: 830, h: 20, size: 11, color: COR.branco, paras: [para(`Nota média (0–10) dada pelas lideranças de loja/VD ao suporte de cada área · pesquisa de ${rot(mesDe(ult))}, sobre ${refDe(mesDe(ult))} · ${fmtInt(ult.respondentes)} respostas.`)] },
      box(105, 'MÉDIA GERAL', fmt2(mAt), ant ? `${rot(mesDe(ant))}: ${fmt2(mAnt)}` : ''),
      box(201, 'MAIOR NOTA', fmt2(aAt[maior]), maior || ''),
      box(297, 'MENOR NOTA', fmt2(aAt[menor]), menor || ''),
      box(393, 'ADESÃO', fmtPct(ult.aptos ? ult.respondentes / ult.aptos : null), `${fmtInt(ult.respondentes)} de ${fmtInt(ult.aptos)} gestores aptos${ant ? ` · ${rot(mesDe(ant))}: ${fmtInt(ant.respondentes)}` : ''}`),
      [card(255, 105, 455, 385)],
      { t: 'chart', x: 265, y: 111, w: 435, h: 373, kind: 'bar', fmt: 'dec1', legend: !!ant, catSize: 8, labelSize: 7.5, title: `NOTA MÉDIA POR ÁREA${ant ? ` · ${rot(mesDe(ult)).toUpperCase()} × ${rot(mesDe(ant)).toUpperCase()}` : ''}`, labels: areas,
        series: [{ name: rot(mesDe(ult)), values: areas.map(a => aAt[a]), color: '1C7CEC' }].concat(ant ? [{ name: rot(mesDe(ant)), values: areas.map(a => (aAnt[a] == null ? null : aAnt[a])), color: '8EA3CF' }] : []) },
      [card(720, 105, 215, 385),
        { t: 'text', x: 732, y: 115, w: 191, h: 365, size: 9.5, color: COR.branco, paras: [
          para('**EVOLUÇÃO**', { run: { color: '6FA8FF' }, spaceAfter: 3 }),
          para(ant ? `Média ${fmt2(mAnt)} → ${fmt2(mAt)}.` : 'Primeiro ciclo da série.', { spaceAfter: 6 }),
          quedas.length ? para('**Maiores quedas**', { run: { color: COR.amarelo }, spaceAfter: 3 }) : para(' '),
        ].concat(quedas.filter(x => x.d < 0).slice(0, 3).map(x => para(`${x.a} (${x.d.toFixed(1).replace('.', ',')})`, { bullet: true }))).concat(
          [para('**Maiores altas**', { run: { color: '3CCB8B' }, spaceBefore: 6, spaceAfter: 3 })],
          quedas.filter(x => x.d > 0).slice(-3).reverse().map(x => para(`${x.a} (+${x.d.toFixed(1).replace('.', ',')})`, { bullet: true })),
          [para(`${areas.filter(a => aAt[a] < 8).length} área(s) abaixo de 8.`, { spaceBefore: 8 })]
        ) }]
    );
    const notas = `Fonte: planilha 16 (Pesquisa de Satisfação, módulo do Hub). A pesquisa aplicada em ${rot(mesDe(ult))} avalia o suporte de ${refDe(mesDe(ult))}. Média geral = média de todas as notas do ciclo. Adesão = gestores que responderam ÷ gestores aptos (tag pesquisa.satisfacao no cadastro).`;
    return { id: 'cult-satisfacao', nome: 'Satisfação com Áreas de Suporte', fundo: 'conteudo', els, notas };
  }

  window.HUB_FECHAMENTO_CULTURA = {
    // Ordem do deck: Cultura (Feedz), Feedbacks, Humor, Pesquisa de Engajamento e Satisfação. Sem base, o slide sai.
    cultura: (p, cult) => [slideCultura(p, cult), cult.feedbacks ? slideFeedbacks(p, cult) : null, cult.humor ? slideHumor(p, cult) : null, slideEngajamento(p, cult), slideSatisfacao(p, cult)].filter(Boolean),
    engajamentoDe,
    td: (p, cult) => [slideTwygo(p, cult), slideParceiras(p, cult)],
    _internal: { mesesDe, mesesAte, valor, pilares, engajamentoDe }
  };
})();
