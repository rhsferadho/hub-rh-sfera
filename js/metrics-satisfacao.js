// Motor de cálculo da Pesquisa de Satisfação com o Suporte do Escritório
// (Indicadores → Pesquisa de Satisfação). Não acessa o banco nem o DOM — pode
// ser testado em Node (test/satisfacao.test.js).
//
// Entrada: linhas de satisfacao_dados() — { pesquisa, area, nota, melhorar[],
// extra, comentario, unidade, departamento } — e os ciclos (satisfacao_ciclo).
//
// SIGILO: o banco já devolve só as áreas liberadas no perfil, sem loja para quem
// não tem a visão completa. recortar() repete a mesma regra no navegador para o
// "Visualizar como" (a sessão real é do Administrador, que recebe tudo).
(function () {
  const U = HUB_UTILS;
  const N = s => U.normalizeText(s == null ? '' : s);

  const PERM = 'indicadores.satisfacao';
  const PERM_COMPLETO = 'indicadores.satisfacao_completo';

  // Nota média (0 a 10).
  const FAIXAS = [
    { min: 9, id: 'otimo', rotulo: 'Ótimo', cor: '#0f8a4c', fundo: '#DDF5E8' },
    { min: 8, id: 'bom', rotulo: 'Bom', cor: '#1baf7a', fundo: '#EEF9F3' },
    { min: 7, id: 'atencao', rotulo: 'Atenção', cor: '#c98500', fundo: '#FFF6E0' },
    { min: -Infinity, id: 'critico', rotulo: 'Crítico', cor: '#d03b3b', fundo: '#FDECEC' }
  ];
  // NPS (% notas 9-10 − % notas 0-6), zonas usuais.
  const ZONAS_NPS = [
    { min: 75, rotulo: 'Excelência', cor: '#0f8a4c' },
    { min: 50, rotulo: 'Qualidade', cor: '#1baf7a' },
    { min: 0, rotulo: 'Aperfeiçoamento', cor: '#c98500' },
    { min: -Infinity, rotulo: 'Crítica', cor: '#d03b3b' }
  ];
  // Opções do "O que melhorar?" no formulário.
  const MELHORAR = ['Tempo de resposta', 'Tempo para resolução', 'Qualidade da solução', 'Educação e cordialidade'];
  const NADA = 'Nada a melhorar';
  // Ordem das áreas (a do formulário); área nova entra no fim, em ordem alfabética.
  const ORDEM_AREAS = ['Financeiro', 'Compras', 'Recrutamento e Seleção', 'DHO', 'T&D', 'DP', 'TI', 'Manutenção', 'Auditoria', 'Administrativo', 'Marketing', 'Jurídico', 'Suprimentos Indiretos'];
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  const mesISO = v => String(v || '').slice(0, 7);
  const rotuloMes = m => { const [a, n] = mesISO(m).split('-'); return MESES[Number(n) - 1] + '/' + a.slice(2); };
  const rotuloMesLongo = m => { const [a, n] = mesISO(m).split('-'); return MESES_LONGOS[Number(n) - 1] + ' de ' + a; };
  // A pesquisa aplicada num mês avalia o MÊS ANTERIOR (a de set/26 avalia agosto/26).
  const mesReferencia = m => { const [a, n] = mesISO(m).split('-').map(Number); return n === 1 ? (a - 1) + '-12' : a + '-' + String(n - 1).padStart(2, '0'); };
  const rotuloCiclo = m => rotuloMes(m) + ' (ref. ' + rotuloMes(mesReferencia(m)) + ')';
  const rotuloCicloLongo = m => { const [a, n] = mesISO(m).split('-'); const r = mesReferencia(m).split('-'); return 'Pesquisa de ' + MESES[Number(n) - 1] + '/' + a + ' · avalia ' + MESES_LONGOS[Number(r[1]) - 1] + '/' + r[0]; };
  const faixa = v => v == null ? null : FAIXAS.find(f => v >= f.min);
  const zonaNps = v => v == null ? null : ZONAS_NPS.find(z => v >= z.min);
  const fmtNota = v => v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtNps = v => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v));
  const fmtVarNota = v => v == null ? '' : (Math.abs(v) < 0.05 ? '= 0,0' : (v > 0 ? '▲ ' : '▼ ') + fmtNota(Math.abs(v)));
  const fmtVarNps = v => v == null ? '' : (Math.round(v) === 0 ? '= 0' : (v > 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(v)));

  function ordenarAreas(areas) {
    return Array.from(new Set(areas)).sort((a, b) => {
      const ia = ORDEM_AREAS.indexOf(a), ib = ORDEM_AREAS.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.localeCompare(b, 'pt-BR');
    });
  }

  // ------------------------------------------------------------------
  // Acesso (mesma regra de satisfacao_dados() no banco)
  // ------------------------------------------------------------------
  function acessoDe(user) {
    const P = window.HUB_PERMISSIONS;
    const tem = k => P ? P.hasPerm(user, k) : !!(user && (user.perfil === 'admin' || (user.permissoes || {})[k] === true));
    const completo = tem(PERM_COMPLETO);
    const modulo = completo || tem(PERM);
    return { modulo, completo, areas: completo ? null : ((user && user.satisfacao_areas) || []).slice() };
  }

  function recortar(respostas, acesso) {
    if (!acesso || !acesso.modulo) return [];
    if (acesso.completo) return respostas;
    const ok = new Set(acesso.areas.map(N));
    return respostas.filter(r => ok.has(N(r.area))).map(r => Object.assign({}, r, { unidade: null, departamento: null }));
  }

  // ------------------------------------------------------------------
  // Estatísticas de um conjunto de respostas
  // ------------------------------------------------------------------
  function stats(rows) {
    const dist = new Array(11).fill(0);
    const melhorar = {};
    let n = 0, soma = 0, prom = 0, det = 0, comMelhorar = 0;
    for (const r of rows) {
      const v = r.nota == null || r.nota === '' ? null : Number(r.nota);
      if (v != null && !isNaN(v)) {
        n++; soma += v;
        dist[Math.max(0, Math.min(10, Math.round(v)))]++;
        if (v >= 9) prom++; else if (v <= 6) det++;
      }
      const ops = r.melhorar || [];
      if (ops.length) comMelhorar++;
      for (const o of ops) melhorar[o] = (melhorar[o] || 0) + 1;
    }
    const media = n ? soma / n : null;
    const nps = n ? (prom - det) / n * 100 : null;
    // Principal ponto a melhorar: a opção (fora "Nada a melhorar") mais marcada.
    const pontos = Object.entries(melhorar).filter(([k]) => N(k) !== N(NADA)).sort((a, b) => b[1] - a[1]);
    return {
      respostas: rows.length, n, soma, media, nps, promotores: prom, detratores: det, neutros: n - prom - det,
      pctPromotores: n ? prom / n : null, pctDetratores: n ? det / n : null,
      dist, melhorar, comMelhorar, principal: pontos.length ? pontos[0][0] : null,
      pctNada: comMelhorar ? (melhorar[NADA] || 0) / comMelhorar : null
    };
  }

  // ------------------------------------------------------------------
  // Índice: área → ciclo → linhas
  // ------------------------------------------------------------------
  function indexar(respostas) {
    const porArea = new Map();
    const ciclos = new Set();
    for (const r of respostas) {
      const m = mesISO(r.pesquisa);
      if (!m) continue;
      ciclos.add(m);
      if (!porArea.has(r.area)) porArea.set(r.area, new Map());
      const pa = porArea.get(r.area);
      if (!pa.has(m)) pa.set(m, []);
      pa.get(m).push(r);
    }
    return { porArea, ciclos: Array.from(ciclos).sort(), areas: ordenarAreas(Array.from(porArea.keys())) };
  }

  // Ciclo anterior em que a área foi avaliada.
  function anteriorDa(idx, area, ciclo) {
    const pa = idx.porArea.get(area);
    if (!pa) return null;
    const antes = Array.from(pa.keys()).filter(m => m < ciclo).sort();
    return antes.length ? antes[antes.length - 1] : null;
  }

  function resumoArea(idx, area, ciclo) {
    const pa = idx.porArea.get(area) || new Map();
    const atual = pa.has(ciclo) ? stats(pa.get(ciclo)) : null;
    const mAnt = anteriorDa(idx, area, ciclo);
    const ant = mAnt ? stats(pa.get(mAnt)) : null;
    return {
      area, ciclo, atual, anterior: ant, cicloAnterior: mAnt,
      varNota: atual && ant && atual.media != null && ant.media != null ? atual.media - ant.media : null,
      varNps: atual && ant && atual.nps != null && ant.nps != null ? atual.nps - ant.nps : null
    };
  }

  function serieArea(idx, area, ciclos) {
    const pa = idx.porArea.get(area) || new Map();
    return ciclos.map(m => ({ ciclo: m, s: pa.has(m) ? stats(pa.get(m)) : null }));
  }

  // Visão geral do ciclo: ranking das áreas e números consolidados.
  function visaoGeral(idx, ciclo, ciclosTab) {
    const areas = idx.areas.map(a => resumoArea(idx, a, ciclo)).filter(x => x.atual && x.atual.n);
    const todas = [];
    for (const a of idx.areas) { const pa = idx.porArea.get(a); if (pa.has(ciclo)) todas.push(...pa.get(ciclo)); }
    const ant = idx.ciclos.filter(m => m < ciclo).pop() || null;
    const todasAnt = [];
    if (ant) for (const a of idx.areas) { const pa = idx.porArea.get(a); if (pa.has(ant)) todasAnt.push(...pa.get(ant)); }
    const geral = stats(todas), geralAnt = ant ? stats(todasAnt) : null;
    const tab = new Map((ciclosTab || []).map(c => [mesISO(c.pesquisa), c]));
    const cAt = tab.get(ciclo) || null, cAnt = ant ? tab.get(ant) || null : null;
    const ranking = areas.slice().sort((a, b) => b.atual.media - a.atual.media);
    return {
      ciclo, cicloAnterior: ant, areas: ranking, geral, geralAnterior: geralAnt,
      varNota: geralAnt && geral.media != null && geralAnt.media != null ? geral.media - geralAnt.media : null,
      varNps: geralAnt && geral.nps != null && geralAnt.nps != null ? geral.nps - geralAnt.nps : null,
      respondentes: cAt ? cAt.respondentes : null,
      respondentesAnt: cAnt ? cAnt.respondentes : null,
      aptos: cAt ? cAt.aptos : null,
      participacao: cAt && cAt.aptos ? Math.min(1, cAt.respondentes / cAt.aptos) : null,
      melhor: ranking[0] || null, pior: ranking.length > 1 ? ranking[ranking.length - 1] : null
    };
  }

  // Mapa de calor: área × ciclo (nota média e n).
  function mapaCalor(idx, ciclos) {
    return idx.areas.map(a => ({ area: a, celulas: serieArea(idx, a, ciclos) }));
  }

  // ------------------------------------------------------------------
  // Recortes da visão completa (exigem unidade/departamento)
  // ------------------------------------------------------------------
  function operacaoDe(r) {
    const MB = window.HUB_METRICS_BOLETIM;
    const id = MB ? MB.operacaoDe(r.unidade, r.departamento) : null;
    const op = id && MB.OP_POR_ID ? MB.OP_POR_ID.get(id) : null;
    return { id: id || 'outras', nome: op ? op.nome : (r.unidade || 'Sem unidade') };
  }

  // [{ id, nome, s }] por operação, para uma área (ou todas, area = null) no ciclo.
  function porOperacao(respostas, ciclo, area) {
    const g = new Map();
    for (const r of respostas) {
      if (mesISO(r.pesquisa) !== ciclo || (area && r.area !== area) || r.unidade == null) continue;
      const op = operacaoDe(r);
      if (!g.has(op.id)) g.set(op.id, { id: op.id, nome: op.nome, rows: [] });
      g.get(op.id).rows.push(r);
    }
    const MB = window.HUB_METRICS_BOLETIM;
    const ordem = MB ? MB.OPERACOES.map(o => o.id) : [];
    return Array.from(g.values()).map(x => ({ id: x.id, nome: x.nome, s: stats(x.rows) }))
      .sort((a, b) => ((ordem.indexOf(a.id) + 1) || 99) - ((ordem.indexOf(b.id) + 1) || 99) || a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  // Matriz operação × área no ciclo (nota média e n).
  function matrizOperacoes(respostas, ciclo, areas) {
    const ops = porOperacao(respostas, ciclo, null);
    return ops.map(o => ({
      id: o.id, nome: o.nome, total: o.s,
      areas: areas.map(a => stats(respostas.filter(r => mesISO(r.pesquisa) === ciclo && r.area === a && r.unidade != null && operacaoDe(r).id === o.id)))
    }));
  }

  function porLoja(respostas, ciclo, area) {
    const g = new Map();
    for (const r of respostas) {
      if (mesISO(r.pesquisa) !== ciclo || r.area !== area || r.unidade == null) continue;
      const k = (r.unidade || '') + '\u0001' + (r.departamento || '');
      if (!g.has(k)) g.set(k, { unidade: r.unidade, departamento: r.departamento, operacao: operacaoDe(r).nome, rows: [] });
      g.get(k).rows.push(r);
    }
    return Array.from(g.values()).map(x => ({ unidade: x.unidade, departamento: x.departamento, operacao: x.operacao, s: stats(x.rows) }))
      .sort((a, b) => (a.s.media == null ? 99 : a.s.media) - (b.s.media == null ? 99 : b.s.media) || String(a.departamento).localeCompare(String(b.departamento), 'pt-BR'));
  }

  // ------------------------------------------------------------------
  // Comentários
  // ------------------------------------------------------------------
  // "." / "ok" / "nada a declarar" / "sem comentários" e afins: sem conteúdo.
  const VAZIO_RE = /^(nada|nenhum|nenhuma|sem|tudo ok|ok|bom|boa|bons|otimo|otima|otimos|otimas|n a|na|nao|nada de negativo|neutra|indiferente)( (a|de|para|ha|com))?( (declarar|comentar|comentario|comentarios|melhorar|melhoras|falar|reclamar|acrescentar|objecao|objecoes|ressalva|ressalvas|dizer))?$/;
  function comentarioVazio(s) {
    const t = N(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.replace(/[^a-z]/g, '').length < 3) return true;
    return VAZIO_RE.test(t);
  }

  function comentarios(respostas, ciclo, area, opts) {
    opts = opts || {};
    const busca = N(opts.busca || '');
    return respostas
      .filter(r => mesISO(r.pesquisa) === ciclo && r.area === area && r.comentario)
      .filter(r => opts.todos || !comentarioVazio(r.comentario))
      .filter(r => !busca || N(r.comentario).includes(busca))
      .map(r => ({ nota: r.nota == null ? null : Number(r.nota), melhorar: r.melhorar || [], comentario: r.comentario, operacao: r.unidade != null ? operacaoDe(r).nome : null }))
      .sort((a, b) => opts.ordem === 'maior'
        ? (b.nota == null ? -1 : b.nota) - (a.nota == null ? -1 : a.nota)
        : (a.nota == null ? 99 : a.nota) - (b.nota == null ? 99 : b.nota));
  }

  // Compras: "Quantas reuniões o time realizou com você este mês?"
  function distribuicaoExtra(rows) {
    const c = {};
    for (const r of rows) if (r.extra) c[r.extra] = (c[r.extra] || 0) + 1;
    const ordem = ['0 reuniões', '1 reunião', '2 reuniões', '3 reuniões ou mais', 'Não sei / Não se aplica'];
    return Object.entries(c).sort((a, b) => ((ordem.indexOf(a[0]) + 1) || 99) - ((ordem.indexOf(b[0]) + 1) || 99));
  }

  window.HUB_METRICS_SATISFACAO = {
    PERM, PERM_COMPLETO, FAIXAS, ZONAS_NPS, MELHORAR, NADA, ORDEM_AREAS,
    acessoDe, recortar, stats, indexar, resumoArea, serieArea, visaoGeral, mapaCalor,
    porOperacao, matrizOperacoes, porLoja, comentarios, comentarioVazio, distribuicaoExtra, ordenarAreas,
    faixa, zonaNps, fmtNota, fmtNps, fmtVarNota, fmtVarNps, rotuloMes, rotuloMesLongo, mesReferencia, rotuloCiclo, rotuloCicloLongo, mesISO
  };
})();
