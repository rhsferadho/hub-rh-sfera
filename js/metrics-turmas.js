// Treinamento e Desenvolvimento → Turmas e Multiplicadoras: contas sobre as
// turmas importadas das planilhas das multiplicadoras (tabela treinamento_turmas).
// Usadas pela tela (sections/turmas.js) e pelo slide do Fechamento.
//
//   Horas de treinamento = soma da duração das turmas (esforço da multiplicadora).
//   Horas entregues      = duração × presentes (campo horasPessoa).
//   Aderência            = presentes ÷ convocados (campo presenca); numa turma com mais presentes
//                          que convocados (erro de lançamento), conta no máximo 100%.
//   Turma em dupla conta uma vez no total e entra na linha de cada multiplicadora.
(function () {
  const U = HUB_UTILS;
  const N = s => U.normalizeText(s == null ? '' : s);
  const iso = d => (d ? String(d).slice(0, 10) : null);

  function filtrar(turmas, f) {
    f = f || {};
    return (turmas || []).filter(t => {
      const d = iso(t.data);
      if (f.de && d < f.de) return false;
      if (f.ate && d > f.ate) return false;
      if (f.multiplicadora && !(t.multiplicadoras || []).some(m => N(m) === N(f.multiplicadora))) return false;
      if (f.marca && !(t.marcas || []).some(m => N(m) === N(f.marca))) return false;
      if (f.categoria && t.categoria !== f.categoria) return false;
      return true;
    });
  }

  function resumo(lista) {
    let horas = 0, horasPessoa = 0, presentes = 0, convocados = 0, presOk = 0;
    const multis = new Set();
    for (const t of lista) {
      const h = Number(t.horas) || 0, p = Number(t.presentes) || 0, c = Number(t.convocados) || 0;
      horas += h; horasPessoa += h * p; presentes += p;
      if (t.convocados != null && t.presentes != null) { convocados += c; presOk += Math.min(p, c); }
      (t.multiplicadoras || []).forEach(m => multis.add(m));
    }
    return { turmas: lista.length, horas, horasPessoa, presentes, convocados, presenca: convocados ? presOk / convocados : null, multiplicadoras: multis.size };
  }

  // Agrupa por uma ou várias chaves por turma (marcas, multiplicadoras).
  function agrupar(lista, chaves) {
    const m = new Map();
    for (const t of lista) {
      const ks = [].concat(chaves(t) || []).filter(Boolean);
      for (const k of (ks.length ? ks : ['Não informado'])) { if (!m.has(k)) m.set(k, []); m.get(k).push(t); }
    }
    return Array.from(m.entries()).map(([label, l]) => Object.assign({ label }, resumo(l))).sort((a, b) => b.horasPessoa - a.horasPessoa);
  }

  function porMes(lista) {
    const m = new Map();
    for (const t of lista) { const k = iso(t.data).slice(0, 7); if (!m.has(k)) m.set(k, []); m.get(k).push(t); }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([mes, l]) => Object.assign({ mes, label: U.monthLabel(mes) }, resumo(l)));
  }

  function umAnoAntes(d) { return d ? `${+d.slice(0, 4) - 1}${d.slice(4)}` : d; }

  // Marca de uma unidade do cadastro, no mesmo vocabulário das planilhas.
  function marcaDaUnidade(u) {
    const k = N(u);
    if (k.startsWith('hering')) return 'Hering';
    if (k.startsWith('levi')) return "Levi's";
    if (k.startsWith('escritorio')) return 'Sfera';
    if (k.startsWith('boticario') || k.startsWith('quem disse')) return 'O Boticário';
    return null;
  }

  // Cobertura ESTIMADA da integração: presentes em turmas de integração ÷
  // admitidos no período, por marca. Sem a lista de participantes não dá para
  // saber quem é quem (pode haver integração no mês seguinte à admissão, ou
  // pessoa de fora do cadastro) — por isso é estimativa.
  function coberturaIntegracao(lista, colaboradores, de, ate) {
    const integ = new Map();
    for (const t of lista) {
      if (t.categoria !== 'Integração e onboarding') continue;
      for (const m of (t.marcas || [])) integ.set(m, (integ.get(m) || 0) + (Number(t.presentes) || 0) / Math.max((t.marcas || []).length, 1));
    }
    const adm = new Map();
    for (const c of (colaboradores || [])) {
      const d = iso(c.data_admissao);
      if (!d || (de && d < de) || (ate && d > ate)) continue;
      const m = marcaDaUnidade(c.unidade);
      if (m) adm.set(m, (adm.get(m) || 0) + 1);
    }
    return Array.from(new Set(Array.from(integ.keys()).concat(Array.from(adm.keys()))))
      .map(marca => ({ marca, integrados: Math.round(integ.get(marca) || 0), admitidos: adm.get(marca) || 0 }))
      .map(x => Object.assign(x, { cobertura: x.admitidos ? Math.min(1, x.integrados / x.admitidos) : null }))
      .sort((a, b) => b.admitidos - a.admitidos);
  }

  // Tudo o que a tela e o slide usam, para um período e filtros.
  function painel(turmas, f, colaboradores) {
    const lista = filtrar(turmas, f);
    const ant = filtrar(turmas, Object.assign({}, f, { de: umAnoAntes(f.de), ate: umAnoAntes(f.ate) }));
    return {
      lista, total: resumo(lista), anterior: ant.length ? resumo(ant) : null,
      porMes: porMes(lista),
      porMultiplicadora: agrupar(lista, t => t.multiplicadoras),
      porMarca: agrupar(lista, t => t.marcas),
      porCategoria: agrupar(lista, t => t.categoria),
      porTema: agrupar(lista, t => t.tema),
      porPublico: agrupar(lista, t => t.publico),
      porCanal: agrupar(lista, t => t.canal),
      porModalidade: agrupar(lista, t => t.modalidade),
      cobertura: coberturaIntegracao(lista, colaboradores, f.de, f.ate),
      comAlerta: lista.filter(t => (t.alertas || []).length),
      planilhas: Array.from(new Set((turmas || []).map(t => t.planilha))).sort()
    };
  }

  window.HUB_METRICS_TURMAS = { filtrar, resumo, agrupar, porMes, painel, coberturaIntegracao, marcaDaUnidade, umAnoAntes };
})();
