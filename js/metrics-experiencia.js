// Cálculo dos indicadores da Avaliação da Experiência (AVE 45 e 90 dias) a
// partir das linhas de HUB_EXPERIENCIA_DATA (uma por colaborador avaliado,
// já consolidadas por parsers.js/parseAveExperiencia). Escala das notas: 1 =
// Necessita melhora, 2 = Em desenvolvimento, 3 = Atinge o esperado, 4 = É
// referência — e, só na pergunta "Batendo o Martelo" (o termômetro de
// aprovação do período de experiência): 1 = Reprovado por questões
// culturais, 2 = Reprovado por questões de performance, 3 = Aprovado COM
// ressalvas, 4 = Aprovado SEM ressalvas.
(function () {
  const U = HUB_UTILS;

  // As 7 competências comportamentais/técnicas respondidas por TODOS (gestor
  // e autoavaliação) — a média geral de cada pessoa usa só estas, pra ser
  // comparável entre cargos. As competências de negócio abaixo dependem do
  // cargo (vendas, caixa, liderança) e são analisadas à parte.
  const CORE = [
    'Paixão pelo negócio', 'Mão na massa', 'Gente que gosta de gente', '#Somos todos Sfera',
    'Tá esperando o que ?', 'Aberto ao novo', 'Conhecimento Técnico da Função'
  ];
  const NEGOCIO = ['Meta Atingida', 'Valor de P.A. Atingido', 'Ticket Médio Alcançado', 'Fechamento de Caixa', 'Gestão de Pessoas'];

  const CONCEITOS = { 1: 'Necessita melhora', 2: 'Em desenvolvimento', 3: 'Atinge o esperado', 4: 'É referência' };
  const MARTELO = { 1: 'Reprovado por questões culturais', 2: 'Reprovado por questões de performance', 3: 'Aprovado COM ressalvas', 4: 'Aprovado SEM ressalvas' };
  const MARTELO_CURTO = { 1: 'Reprovado — cultura', 2: 'Reprovado — performance', 3: 'Aprovado c/ ressalvas', 4: 'Aprovado s/ ressalvas' };
  const CORES_CONCEITO = { 1: '#d03b3b', 2: '#f29a3d', 3: '#6cbf6c', 4: '#0c8a3c' };
  const CORES_MARTELO = { 1: '#9b1c1c', 2: '#e5533d', 3: '#eda100', 4: '#1baf7a' };
  const SITUACOES = { ativo: 'Ativo', desativado: 'Desativado', desligado: 'Desligado' };
  const CORES_SITUACAO = { ativo: '#1baf7a', desativado: '#8A8F98', desligado: '#d03b3b' };

  function norm(s) { return U.normalizeText(s || ''); }
  function media(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null; }
  function daysBetween(a, b) {
    if (!a || !b) return null;
    return Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
  }

  function conceitoDaMedia(m) {
    if (m === null || m === undefined) return null;
    if (m < 1.5) return 1;
    if (m < 2.5) return 2;
    if (m < 3.5) return 3;
    return 4;
  }

  // Marca derivada do texto da unidade ("Boticário VD - Juiz de Fora",
  // "Hering", "Levis"...): a planilha não tem uma coluna de marca.
  function marcaDe(unidade) {
    const n = norm(unidade);
    if (!n) return 'Não informado';
    if (n.includes('boticario')) return /\bvd\b/.test(n) ? 'O Boticário VD' : 'O Boticário Lojas';
    if (n.includes('hering')) return 'Hering';
    if (n.includes('levi')) return "Levi's";
    if (n.includes('quem disse')) return 'Quem disse, Berenice?';
    if (n.includes('escritorio')) return 'Escritório';
    return 'Outras';
  }

  function primeiroGestor(s) {
    return String(s || '').split(/[,;]/).map(x => x.trim()).filter(Boolean)[0] || null;
  }

  // Situação atual do colaborador (Ativo/Desativado/Desligado), cruzada com
  // o cadastro de Colaboradores (Headcount) por matrícula, com CPF como
  // reserva — a avaliação de experiência não tem essa coluna própria.
  function mapaSituacaoColaboradores() {
    const map = new Map();
    const rows = (window.HUB_DATA && window.HUB_DATA.colaboradores) || [];
    for (const c of rows) {
      const sit = norm(c.situacao);
      if (!sit) continue;
      if (c.matricula != null && String(c.matricula).trim()) map.set('m:' + String(c.matricula).trim(), sit);
      if (c.cpf != null && String(c.cpf).trim()) map.set('c:' + String(c.cpf).trim(), sit);
    }
    return map;
  }

  function situacaoDe(r, mapa) {
    if (r.matricula != null && String(r.matricula).trim()) {
      const s = mapa.get('m:' + String(r.matricula).trim());
      if (s) return s;
    }
    if (r.cpf != null && String(r.cpf).trim()) {
      const s = mapa.get('c:' + String(r.cpf).trim());
      if (s) return s;
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Campos derivados de cada linha (calculados uma vez por carga de dados)
  // ------------------------------------------------------------------
  function preparar(rows, ciclo) {
    if (rows._preparado === ciclo) return rows;
    const mapaSituacao = mapaSituacaoColaboradores();
    for (const r of rows) {
      const ng = r.notas_gestor || {}, na = r.notas_auto || {};
      const gCore = CORE.map(c => ng[c]).filter(v => v >= 1 && v <= 4);
      const aCore = CORE.map(c => na[c]).filter(v => v >= 1 && v <= 4);
      const mg = media(gCore), ma = media(aCore);
      const dias = daysBetween(r.data_admissao, r.data_avaliacao);
      r._d = {
        marca: marcaDe(r.unidade),
        gestorRotulo: r.gestor_avaliador || primeiroGestor(r.gestor) || r.gestor_direto || 'Não informado',
        dataRef: r.data_avaliacao || r.data_autoavaliacao || U.addDays(r.data_admissao, ciclo),
        mediaGestor: mg, mediaAuto: ma,
        gap: mg !== null && ma !== null ? ma - mg : null,
        dias,
        conceito: conceitoDaMedia(mg),
        cargo: r.cargo || 'Não informado',
        depto: r.departamento || 'Não informado',
        situacao: situacaoDe(r, mapaSituacao)
      };
    }
    rows._preparado = ciclo;
    return rows;
  }

  function filtrar(rows, f) {
    return rows.filter(r => {
      if (f.start || f.end) {
        if (!r._d.dataRef || !U.inRange(r._d.dataRef, f.start, f.end)) return false;
      }
      if (!U.matchesAny(r.unidade, f.unidade)) return false;
      if (!U.matchesAny(r.departamento, f.departamento)) return false;
      if (f.gestor && !(U.normIncludes(r._d.gestorRotulo, f.gestor) || U.normIncludes(r.gestor, f.gestor) || U.normIncludes(r.gestor_direto, f.gestor))) return false;
      if (f.colaborador && !U.normIncludes(r.nome, f.colaborador)) return false;
      return true;
    });
  }

  // ------------------------------------------------------------------
  // Agregações
  // ------------------------------------------------------------------
  function dist4(values) {
    const d = [0, 0, 0, 0];
    for (const v of values) if (v >= 1 && v <= 4) d[v - 1]++;
    return d;
  }

  function adesao(rows, campo) {
    const conc = rows.filter(r => r[campo] === 'concluida').length;
    const rasc = rows.filter(r => r[campo] === 'rascunho').length;
    const pend = rows.filter(r => r[campo] === 'pendente').length;
    const base = conc + rasc + pend;
    return { concluidas: conc, rascunho: rasc, pendentes: pend, base, taxa: base ? conc / base : null };
  }

  function resumoGrupo(label, rs) {
    const dec = rs.filter(r => r.martelo >= 1 && r.martelo <= 4);
    const d = dist4(dec.map(r => r.martelo));
    const ag = adesao(rs, 'status_gestor'), aa = adesao(rs, 'status_auto');
    const mg = media(rs.map(r => r._d.mediaGestor).filter(v => v !== null));
    const ma = media(rs.map(r => r._d.mediaAuto).filter(v => v !== null));
    const n = dec.length;
    return {
      label, total: rs.length, decididos: n, dist: d,
      pctAprov: n ? (d[2] + d[3]) / n : null, pctReprov: n ? (d[0] + d[1]) / n : null,
      pctRessalvas: n ? d[2] / n : null, pctSemRessalvas: n ? d[3] / n : null,
      mediaGestor: mg, mediaAuto: ma,
      gestorConcluidas: ag.concluidas, gestorPendentes: ag.pendentes + ag.rascunho, gestorBase: ag.base, adesaoGestor: ag.taxa,
      autoConcluidas: aa.concluidas, autoPendentes: aa.pendentes + aa.rascunho, autoBase: aa.base, adesaoAuto: aa.taxa
    };
  }

  function agrupar(rows, keyFn) {
    const m = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return Array.from(m.entries()).map(([label, rs]) => resumoGrupo(label, rs));
  }

  // ------------------------------------------------------------------
  // Palavras mais citadas nos comentários do "Batendo o Martelo"
  // ------------------------------------------------------------------
  const STOP = new Set(('para pra com sem sob sobre como mais menos muito muita muitos muitas pouco pouca ainda tambem nao sim ser sao foi era esta estao ' +
    'estava tem tinha ter vai vao seu sua seus suas dele dela deles delas este essa esse isso isto aquele aquela pelo pela pelos pelas ate quando onde quem ' +
    'qual cada todo toda todos todas outro outra outros outras bem mal mesmo mesma sempre nunca vez vezes pois porque entao apesar estar fazer faz fez fica ' +
    'ficar tudo nada algo alguma algum ela ele eles elas voce voces meu minha foram sendo sido estou estamos temos tenho pode podem deve devem esta esta ' +
    'colaborador colaboradora time equipe empresa loja periodo experiencia avaliacao continuar continuidade dias dia anos ano meses mes hoje ainda nosso nossa nossos ' +
    'nossas depois antes durante entre desde tanto tanta ficou ficando deixa deixar sendo sido demonstra demonstrou apresenta apresentou apesar porem contudo ' +
    'ja so ha la ai aqui aprovado aprovada aprovados aprovadas reprovado reprovada reprovados reprovadas ressalva ressalvas questoes questao ' +
    'performance culturais cultural motivo apos teve possui possivel pontos alguns algumas precisa precisam proximo proxima seguir segue ' +
    'sera acredito acho tenha tera vamos bastante boa bom tempo consegue conseguir quanto assim apenas alem').split(/\s+/));

  function termosFrequentes(rows, martelos, limite) {
    const nomesTokens = new Set();
    for (const r of rows) for (const t of norm(r.nome).split(' ')) if (t.length > 1) nomesTokens.add(t);
    const contagem = new Map();
    for (const r of rows) {
      if (!martelos.includes(r.martelo) || !r.martelo_comentario) continue;
      const vistos = new Set();
      for (const t of norm(r.martelo_comentario).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
        if (t.length < 4 || STOP.has(t) || nomesTokens.has(t) || /^\d+$/.test(t) || vistos.has(t)) continue;
        vistos.add(t);
        contagem.set(t, (contagem.get(t) || 0) + 1);
      }
    }
    return Array.from(contagem.entries()).filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1]).slice(0, limite || 12).map(([label, value]) => ({ label, value }));
  }

  // ------------------------------------------------------------------
  // Cálculo principal
  // ------------------------------------------------------------------
  function calcular(rows, ciclo) {
    const gestorAd = adesao(rows, 'status_gestor');
    const autoAd = adesao(rows, 'status_auto');
    const decididos = rows.filter(r => r.martelo >= 1 && r.martelo <= 4);
    const dm = dist4(decididos.map(r => r.martelo));
    const nDec = decididos.length;

    const comMedia = rows.filter(r => r._d.mediaGestor !== null);
    const ambos = rows.filter(r => r._d.gap !== null);

    // Média e distribuição por competência (gestor x autoavaliação)
    const porCompetencia = CORE.map(comp => {
      const vg = rows.map(r => (r.notas_gestor || {})[comp]).filter(v => v >= 1);
      const va = rows.map(r => (r.notas_auto || {})[comp]).filter(v => v >= 1);
      const pares = rows.filter(r => (r.notas_gestor || {})[comp] >= 1 && (r.notas_auto || {})[comp] >= 1)
        .map(r => r.notas_auto[comp] - r.notas_gestor[comp]);
      return {
        comp, nGestor: vg.length, nAuto: va.length,
        mediaGestor: media(vg), mediaAuto: media(va),
        distGestor: dist4(vg), distAuto: dist4(va),
        gap: media(pares), nPares: pares.length,
        pctIguais: pares.length ? pares.filter(x => x === 0).length / pares.length : null,
        pctAutoAcima: pares.length ? pares.filter(x => x > 0).length / pares.length : null,
        pctAutoAbaixo: pares.length ? pares.filter(x => x < 0).length / pares.length : null
      };
    });

    const negocio = NEGOCIO.map(comp => {
      const vg = rows.map(r => (r.notas_gestor || {})[comp]).filter(v => v >= 1);
      const va = rows.map(r => (r.notas_auto || {})[comp]).filter(v => v >= 1);
      return { comp, nGestor: vg.length, nAuto: va.length, mediaGestor: media(vg), mediaAuto: media(va), distGestor: dist4(vg), distAuto: dist4(va) };
    }).filter(c => c.nGestor || c.nAuto);

    // Alinhamento gestor x colaborador (média geral de cada pessoa)
    const alin = { alinhados: 0, autoAcima: 0, autoAbaixo: 0, base: ambos.length };
    for (const r of ambos) {
      if (r._d.gap >= 0.5) alin.autoAcima++;
      else if (r._d.gap <= -0.5) alin.autoAbaixo++;
      else alin.alinhados++;
    }

    // Prazo: dias entre a admissão e a avaliação do gestor
    const dias = rows.filter(r => r.status_gestor === 'concluida' && r._d.dias !== null && r._d.dias >= 0).map(r => r._d.dias);
    const e = [ciclo - 15, ciclo - 5, ciclo, ciclo + 10, ciclo + 25];
    const faixas = [`até ${e[0]}`, `${e[0] + 1}–${e[1]}`, `${e[1] + 1}–${e[2]}`, `${e[2] + 1}–${e[3]}`, `${e[3] + 1}–${e[4]}`, `${e[4] + 1}+`];
    const faixaVals = [0, 0, 0, 0, 0, 0];
    for (const d of dias) {
      const i = d <= e[0] ? 0 : d <= e[1] ? 1 : d <= e[2] ? 2 : d <= e[3] ? 3 : d <= e[4] ? 4 : 5;
      faixaVals[i]++;
    }
    const diasOrd = dias.slice().sort((a, b) => a - b);
    const prazo = {
      n: dias.length, media: media(dias), mediana: diasOrd.length ? diasOrd[Math.floor(diasOrd.length / 2)] : null,
      tardias: dias.filter(d => d > ciclo).length,
      pctTardias: dias.length ? dias.filter(d => d > ciclo).length / dias.length : null,
      distribuicao: faixas.map((label, i) => ({ label, value: faixaVals[i] }))
    };

    // Série mensal (mês da avaliação do gestor)
    const meses = new Map();
    for (const r of decididos) {
      const k = U.monthKey(r.data_avaliacao);
      if (!k) continue;
      if (!meses.has(k)) meses.set(k, [0, 0, 0, 0]);
      meses.get(k)[r.martelo - 1]++;
    }
    const serie = Array.from(meses.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([k, d]) => {
      const t = d[0] + d[1] + d[2] + d[3];
      return { mes: k, label: U.monthLabel(k), total: t, dist: d, pctAprov: t ? (d[2] + d[3]) / t : null, pctReprov: t ? (d[0] + d[1]) / t : null };
    });

    const porUnidade = agrupar(rows, r => r.unidade || 'Não informado').sort((a, b) => b.total - a.total);
    const porMarca = agrupar(rows, r => r._d.marca).sort((a, b) => b.total - a.total);
    const porDepartamento = agrupar(rows, r => r._d.depto).sort((a, b) => b.total - a.total);
    const porCargo = agrupar(rows, r => r._d.cargo).sort((a, b) => b.total - a.total);
    const porGestor = agrupar(rows, r => r._d.gestorRotulo).sort((a, b) => b.total - a.total);

    // Inconsistências entre a nota do "martelo" e as notas das competências
    const aprovadoNotaBaixa = decididos.filter(r => r.martelo === 4 && r._d.mediaGestor !== null && r._d.mediaGestor < 2.5).length;
    const reprovadoNotaAlta = decididos.filter(r => r.martelo <= 2 && r._d.mediaGestor !== null && r._d.mediaGestor >= 3).length;

    const out = {
      ciclo, total: rows.length,
      gestor: gestorAd, auto: autoAd,
      martelo: {
        n: nDec, dist: dm,
        pctAprov: nDec ? (dm[2] + dm[3]) / nDec : null, pctReprov: nDec ? (dm[0] + dm[1]) / nDec : null,
        pctRessalvas: nDec ? dm[2] / nDec : null, pctSemRessalvas: nDec ? dm[3] / nDec : null,
        pctCultura: nDec ? dm[0] / nDec : null, pctPerformance: nDec ? dm[1] / nDec : null
      },
      mediaGestor: media(comMedia.map(r => r._d.mediaGestor)),
      mediaAuto: media(rows.map(r => r._d.mediaAuto).filter(v => v !== null)),
      gapMedio: media(ambos.map(r => r._d.gap)),
      nAmbos: ambos.length,
      alinhamento: alin,
      porCompetencia, negocio, prazo, serie,
      porUnidade, porMarca, porDepartamento, porCargo, porGestor,
      termosReprovados: termosFrequentes(rows, [1, 2], 12),
      termosRessalvas: termosFrequentes(rows, [3], 12),
      aprovadoNotaBaixa, reprovadoNotaAlta
    };
    out.insights = gerarInsights(out);
    return out;
  }

  // ------------------------------------------------------------------
  // Insights e plano de ação
  // ------------------------------------------------------------------
  function gerarInsights(d) {
    const out = [];
    const pct = v => U.fmtPct(v, 0);
    const m = d.martelo;
    if (m.n >= 10 && m.pctReprov >= 0.15) {
      out.push({ tipo: 'alerta', texto: `${pct(m.pctReprov)} dos colaboradores avaliados (${U.fmtInt(m.dist[0] + m.dist[1])} de ${U.fmtInt(m.n)}) foram reprovados no período de experiência de ${d.ciclo} dias — ${U.fmtInt(m.dist[1])} por performance e ${U.fmtInt(m.dist[0])} por questões culturais. ${m.dist[0] > m.dist[1] ? 'O peso maior é cultural: vale revisar o alinhamento de expectativas na seleção e no onboarding.' : 'O peso maior é performance: vale revisar a qualidade do treinamento inicial e o acompanhamento na fase de experiência.'}` });
    } else if (m.n >= 10) {
      out.push({ tipo: 'info', texto: `${pct(m.pctAprov)} dos colaboradores avaliados foram aprovados no período de experiência (${U.fmtInt(m.dist[2] + m.dist[3])} de ${U.fmtInt(m.n)}); ${pct(m.pctReprov)} foram reprovados.` });
    }
    if (m.dist[2] >= 5) {
      out.push({ tipo: 'acao', texto: `${U.fmtInt(m.dist[2])} colaborador(es) foram aprovados COM ressalvas (${pct(m.pctRessalvas)}) — prioridade para um plano de acompanhamento curto (30 dias) com o gestor, registrando quais ressalvas precisam ser resolvidas.` });
    }
    const unidRuins = d.porUnidade.filter(u => u.decididos >= 10 && u.pctReprov !== null).sort((a, b) => b.pctReprov - a.pctReprov);
    if (unidRuins.length && unidRuins[0].pctReprov >= 0.2 && unidRuins[0].pctReprov > (m.pctReprov || 0) + 0.05) {
      out.push({ tipo: 'alerta', texto: `A unidade "${unidRuins[0].label}" tem a maior taxa de reprovação (${pct(unidRuins[0].pctReprov)} de ${U.fmtInt(unidRuins[0].decididos)} avaliados), acima da média geral de ${pct(m.pctReprov)} — vale investigar processo seletivo, treinamento e liderança local.` });
    }
    if (d.gestor.base >= 20 && d.gestor.taxa < 0.85) {
      const pend = d.gestor.pendentes + d.gestor.rascunho;
      const top = d.porGestor.filter(g => g.gestorPendentes > 0).sort((a, b) => b.gestorPendentes - a.gestorPendentes).slice(0, 3);
      out.push({ tipo: 'alerta', texto: `Só ${pct(d.gestor.taxa)} das avaliações do gestor foram concluídas — ${U.fmtInt(pend)} ainda pendentes/em rascunho, sem o "Batendo o Martelo" (sem a decisão de aprovar ou não). ${top.length ? 'Maior concentração: ' + top.map(g => `${g.label} (${g.gestorPendentes})`).join(', ') + '.' : ''}` });
    }
    if (d.auto.base >= 20 && d.auto.taxa < 0.7) {
      out.push({ tipo: 'acao', texto: `A adesão à autoavaliação está em ${pct(d.auto.taxa)} (${U.fmtInt(d.auto.pendentes + d.auto.rascunho)} colaboradores não concluíram). Considere lembrete automático e o gestor acompanhando a conclusão durante a conversa de feedback.` });
    }
    const compGap = d.porCompetencia.filter(c => c.gap !== null && c.nPares >= 20).sort((a, b) => b.gap - a.gap);
    if (d.gapMedio !== null && d.nAmbos >= 20) {
      const acima = d.gapMedio > 0.1, abaixo = d.gapMedio < -0.1;
      out.push({ tipo: 'info', texto: `Em média, o colaborador se avalia ${acima ? 'ACIMA' : abaixo ? 'ABAIXO' : 'em linha com'} do gestor (${d.gapMedio >= 0 ? '+' : ''}${U.fmt1(d.gapMedio)} ponto${acima || abaixo ? '' : 's de diferença'}). ${d.alinhamento.autoAcima ? U.fmtInt(d.alinhamento.autoAcima) + ' pessoa(s) se avaliaram 0,5 ponto ou mais acima do gestor' : ''}${compGap.length && compGap[0].gap > 0.15 ? '; a maior distância está em "' + compGap[0].comp + '" (' + (compGap[0].gap >= 0 ? '+' : '') + U.fmt1(compGap[0].gap) + ').' : '.'}` });
    }
    const piorComp = d.porCompetencia.filter(c => c.mediaGestor !== null && c.nGestor >= 20).sort((a, b) => a.mediaGestor - b.mediaGestor)[0];
    if (piorComp) {
      out.push({ tipo: 'acao', texto: `A competência com menor nota média dada pelos gestores é "${piorComp.comp}" (${U.fmt1(piorComp.mediaGestor)}) — bom tema para reforçar no onboarding e nas trilhas de desenvolvimento.` });
    }
    if (d.prazo.n >= 20 && d.prazo.pctTardias >= 0.2) {
      out.push({ tipo: 'alerta', texto: `${pct(d.prazo.pctTardias)} das avaliações do gestor foram feitas depois do dia ${d.ciclo} da admissão (mediana de ${U.fmtInt(d.prazo.mediana)} dias). Avaliação tardia reduz o valor da decisão de aprovar ou não o colaborador.` });
    }
    if (d.aprovadoNotaBaixa >= 3) {
      out.push({ tipo: 'alerta', texto: `${U.fmtInt(d.aprovadoNotaBaixa)} colaborador(es) receberam "Aprovado SEM ressalvas" mas com média de competências abaixo de 2,5 — possível inconsistência entre as notas e a decisão final; vale revisar com o gestor.` });
    }
    if (d.reprovadoNotaAlta >= 3) {
      out.push({ tipo: 'alerta', texto: `${U.fmtInt(d.reprovadoNotaAlta)} colaborador(es) foram reprovados mesmo com média de competências igual ou acima de 3,0 — confira a justificativa registrada no "Batendo o Martelo".` });
    }
    return out;
  }

  // ------------------------------------------------------------------
  // Evolução 45 → 90 dias (mesmo colaborador nos dois ciclos)
  // ------------------------------------------------------------------
  function chavePessoa(r) { return r.cpf ? 'cpf:' + r.cpf + '|' + (r.data_admissao || '') : 'k:' + r.pessoa_key; }

  function comparar(rows45, rows90) {
    const idx90 = new Map();
    for (const r of rows90) idx90.set(chavePessoa(r), r);
    const pares = [];
    for (const a of rows45) { const b = idx90.get(chavePessoa(a)); if (b) pares.push({ a, b }); }
    const comDecisao = pares.filter(p => p.a.martelo >= 1 && p.b.martelo >= 1);
    const matriz = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
    for (const p of comDecisao) matriz[p.a.martelo - 1][p.b.martelo - 1]++;
    let subiu = 0, igual = 0, desceu = 0;
    for (const p of comDecisao) { if (p.b.martelo > p.a.martelo) subiu++; else if (p.b.martelo < p.a.martelo) desceu++; else igual++; }

    const comMedias = pares.filter(p => p.a._d.mediaGestor !== null && p.b._d.mediaGestor !== null);
    const deltas = comMedias.map(p => p.b._d.mediaGestor - p.a._d.mediaGestor);
    const porCompetencia = CORE.map(comp => {
      const d = pares.filter(p => (p.a.notas_gestor || {})[comp] >= 1 && (p.b.notas_gestor || {})[comp] >= 1)
        .map(p => [p.a.notas_gestor[comp], p.b.notas_gestor[comp]]);
      return { comp, n: d.length, media45: media(d.map(x => x[0])), media90: media(d.map(x => x[1])), delta: d.length ? media(d.map(x => x[1] - x[0])) : null };
    });
    const pioraram = comDecisao.filter(p => p.b.martelo < p.a.martelo && p.b.martelo <= 2)
      .map(p => ({ nome: p.b.nome, cargo: p.b.cargo, unidade: p.b.unidade, gestor: p.b._d.gestorRotulo, de: p.a.martelo, para: p.b.martelo, comentario: p.b.martelo_comentario }));
    const reprov45Seguem = comDecisao.filter(p => p.a.martelo <= 2 && p.b.martelo >= 1).length;
    return {
      nPares: pares.length, nDecisao: comDecisao.length, matriz, subiu, igual, desceu,
      nMedias: comMedias.length, deltaMedio: media(deltas),
      pctMelhoraram: deltas.length ? deltas.filter(x => x >= 0.25).length / deltas.length : null,
      pctPioraram: deltas.length ? deltas.filter(x => x <= -0.25).length / deltas.length : null,
      media45: media(comMedias.map(p => p.a._d.mediaGestor)), media90: media(comMedias.map(p => p.b._d.mediaGestor)),
      porCompetencia, pioraram, reprov45Seguem
    };
  }

  window.HUB_EXP_METRICS = {
    CORE, NEGOCIO, CONCEITOS, MARTELO, MARTELO_CURTO, CORES_CONCEITO, CORES_MARTELO,
    SITUACOES, CORES_SITUACAO,
    conceitoDaMedia, marcaDe, preparar, filtrar, calcular, comparar, agrupar, resumoGrupo
  };
})();
