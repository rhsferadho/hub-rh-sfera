// Indicadores de R&S do Fechamento do Período, calculados sobre a base da
// planilha 18 (tabela controle_vagas).
//
// SLA (regra oficial do R&S, 08/10/2026), em dias corridos da abertura ao
// fechamento:
//   Operacional — Loja RJ 20 · VD RJ/SG 25 · Loja MG 34 · VD MG 34
//   Estratégica — 35 em todas as operações
// Hering, Levi's, Quem disse, Berenice?, Escritório, Valença e Três Rios
// ainda não foram enquadrados pelo R&S: seguem a régua que a coluna
// "Status SLA" da planilha já usava (20 dias), e o VD Três Rios a de VD RJ.
// Confirmar com a gestão de R&S.
(function () {
  const SLA_ESTRATEGICA = 35;
  const SLA_OPERACIONAL = {
    'Boticário - Rio de Janeiro': 20,
    'Boticário VD - Rio de Janeiro': 25,
    'Boticário - Interior de MG': 34,
    'Boticário - Juiz de Fora': 34,
    'Boticário VD - Interior de MG': 34,
    'Boticário VD - Juiz de Fora': 34,
    // a confirmar com o R&S
    'Boticário - Valença': 20,
    'Boticário - Três Rios': 20,
    'Boticário VD - Três Rios': 25,
    'Hering': 20,
    'Levis': 20,
    "Levi's": 20,
    'Quem disse, Berenice?': 20,
    'Escritório': 20
  };

  function slaMeta(v) {
    if (v.tipo_vaga === 'Estratégica') return SLA_ESTRATEGICA;
    const m = SLA_OPERACIONAL[v.unidade];
    return m == null ? null : m;
  }

  const MS_DIA = 86400000;
  function dias(de, ate) {
    if (!de || !ate) return null;
    return Math.round((Date.parse(ate) - Date.parse(de)) / MS_DIA);
  }

  // Vaga finalizada: dias para fechar e se ficou no prazo (null = sem regra).
  function slaVaga(v) {
    const d = dias(v.data_abertura, v.data_fechamento);
    const meta = slaMeta(v);
    return { dias: d, meta, noPrazo: d == null || meta == null ? null : d <= meta };
  }

  const finalizada = v => v.status_vaga === 'Finalizada' && !!v.data_fechamento;
  const entre = (iso, de, ate) => !!iso && iso >= de && iso <= ate;
  const media = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

  function contar(lista, chave) {
    const m = {};
    for (const v of lista) { const k = chave(v) || '(não informado)'; m[k] = (m[k] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([nome, qtd]) => ({ nome, qtd }));
  }

  // Números de um período [de, ate] (datas ISO, inclusivas).
  function periodo(vagas, de, ate) {
    const fechadas = vagas.filter(v => finalizada(v) && entre(v.data_fechamento, de, ate));
    const abertas = vagas.filter(v => entre(v.data_abertura, de, ate));
    const canceladas = vagas.filter(v => v.status_vaga === 'Cancelada' && entre(v.data_cancelamento, de, ate));
    const sla = fechadas.map(v => Object.assign({ v }, slaVaga(v)));
    const comRegra = sla.filter(s => s.noPrazo != null);
    const porTipo = tipo => {
      const s = sla.filter(x => x.v.tipo_vaga === tipo);
      const r = s.filter(x => x.noPrazo != null);
      return {
        fechadas: s.length,
        diasMedio: media(s.map(x => x.dias).filter(d => d != null)),
        noPrazo: r.length ? r.filter(x => x.noPrazo).length / r.length : null
      };
    };
    return {
      de, ate,
      abertas: abertas.length,
      fechadas: fechadas.length,
      canceladas: canceladas.length,
      noPrazo: comRegra.length ? comRegra.filter(s => s.noPrazo).length / comRegra.length : null,
      noPrazoPlanilha: fechadas.length ? fechadas.filter(v => !v.status_sla_planilha).length / fechadas.length : null,
      diasMedio: media(sla.map(s => s.dias).filter(d => d != null)),
      operacional: porTipo('Operacional'),
      estrategica: porTipo('Estratégica'),
      naturezaFechadas: contar(fechadas, v => v.natureza),
      naturezaAbertas: contar(abertas, v => v.natureza),
      fontesOperacional: contar(fechadas.filter(v => v.tipo_vaga === 'Operacional'), v => v.fonte),
      fontesEstrategica: contar(fechadas.filter(v => v.tipo_vaga === 'Estratégica'), v => v.fonte),
      unidadesFechadas: contar(fechadas, v => v.unidade)
    };
  }

  // Foto de hoje: vagas em aberto e em andamento.
  function ativas(vagas) {
    const grupo = status => {
      const l = vagas.filter(v => v.status_vaga === status);
      return { total: l.length, porTipo: contar(l, v => v.tipo_vaga), porNatureza: contar(l, v => v.natureza), porUnidade: contar(l, v => v.unidade) };
    };
    return { aberta: grupo('Aberta'), andamento: grupo('Andamento'), congelada: grupo('Congelada') };
  }

  // Abertas e fechadas mês a mês de um ano (realizado da projeção).
  function mensal(vagas, ano) {
    const meses = [];
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      const de = `${ano}-${mm}-01`, ate = `${ano}-${mm}-31`;
      meses.push({
        mes: m,
        abertas: vagas.filter(v => entre(v.data_abertura, de, ate)).length,
        fechadas: vagas.filter(v => finalizada(v) && entre(v.data_fechamento, de, ate)).length
      });
    }
    return meses;
  }

  window.HUB_METRICS_FECHAMENTO = { SLA_ESTRATEGICA, SLA_OPERACIONAL, slaMeta, slaVaga, periodo, ativas, mensal, _internal: { dias } };
})();
