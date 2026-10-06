// Leitura das 3 planilhas que alimentam só o Boletim da Liderança. Nenhuma
// delas guarda linha individual no Supabase: tudo é AGREGADO aqui no navegador
// antes de gravar (sem nome, CPF, e-mail nem comentário), por mês/dia e por
// unidade + departamento:
//   • "36. Humor.xlsx"                      → parseHumor
//   • Notas da Pesquisa de Engajamento      → parseEngajamentoNotas
//       (aba "Respostas" da planilha 33 ou aba "pesquisa_engajamento" do export do Feedz)
//   • "61. Pesquisa de Satisfação.xlsx"     → parseSatisfacao
(function () {
  const I = HUB_PARSERS._internal;
  const norm = h => String(h == null ? '' : h).normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

  function linhas(ws) { return XLSX.utils.sheet_to_json(ws, { defval: '', raw: true }); }

  // Aba pelo nome (sem acento/caixa) ou, se não houver, a que tem mais cabeçalhos esperados.
  function escolherAba(wb, nomes, esperados, minimo, rotulo) {
    for (const n of nomes) {
      const real = wb.SheetNames.find(s => norm(s) === norm(n));
      if (real) {
        const rows = linhas(wb.Sheets[real]);
        if (rows.length) return rows;
      }
    }
    let melhor = null, nota = -1;
    for (const s of wb.SheetNames) {
      const rows = linhas(wb.Sheets[s]);
      if (!rows.length) continue;
      const hs = Object.keys(rows[0]).map(norm);
      const n = esperados.filter(e => hs.includes(norm(e))).length;
      if (n > nota) { nota = n; melhor = rows; }
    }
    if (!melhor || nota < minimo) throw new Error(`Este arquivo não parece ser a planilha "${rotulo}" (colunas esperadas: ${esperados.join(', ')}).`);
    return melhor;
  }

  function leitor(row) {
    const idx = {};
    for (const k of Object.keys(row)) { const n = norm(k); if (!(n in idx)) idx[n] = k; }
    return (...nomes) => {
      for (const n of nomes) {
        const k = idx[norm(n)];
        if (k !== undefined && row[k] !== '' && row[k] != null) return row[k];
      }
      return null;
    };
  }

  // Datas do Feedz em texto vêm como DIA/MÊS/ANO ("25/09/2026 07:40:17").
  function dataBR(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date || typeof v === 'number') return I.toISODate(v);
    const s = String(v).trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/.exec(s);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return I.toISODate(s);
  }
  const mesDe = d => d ? d.slice(0, 7) + '-01' : null;

  // Coluna PESQUISA da planilha 61: texto "set/26" (ou "setembro/2026"), às vezes data.
  const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function mesBR(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date || typeof v === 'number') return mesDe(dataBR(v));
    const m = /^([a-z]{3})[a-z]*\.?\s*[\/\- ]\s*(\d{2}|\d{4})$/.exec(norm(v));
    if (m) {
      const i = MESES_ABREV.indexOf(m[1]);
      if (i < 0) return null;
      const ano = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
      return `${ano}-${String(i + 1).padStart(2, '0')}-01`;
    }
    return mesDe(dataBR(v));
  }
  const txt = v => { const s = I.str(v); return s ? s.replace(/\s+/g, ' ') : null; };

  // ---------------------------------------------------------------------
  // 36. Humor.xlsx → humor_mensal (mês × unidade × departamento)
  // ---------------------------------------------------------------------
  function parseHumor(wb) {
    const rows = escolherAba(wb, ['Worksheet', 'Humor'], ['Nome', 'Unidade', 'Departamento', 'Nota do Humor', 'Data'], 4, '36. Humor');
    const grupos = new Map();
    let ignoradas = 0;
    for (const row of rows) {
      const g = leitor(row);
      const dia = dataBR(g('Data'));
      const nota = I.num(g('Nota do Humor', 'Nota'));
      if (!dia || nota == null || nota < 1 || nota > 5) { ignoradas++; continue; }
      const unidade = txt(g('Unidade')), departamento = txt(g('Departamento'));
      const k = mesDe(dia) + '\u0001' + norm(unidade) + '\u0001' + norm(departamento);
      if (!grupos.has(k)) grupos.set(k, { mes: mesDe(dia), unidade, departamento, registros: 0, soma: 0, _p: new Set(), dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
      const x = grupos.get(k);
      x.registros++; x.soma += nota; x.dist[Math.round(nota)]++;
      x._p.add(norm(g('Nome')));
    }
    const out = Array.from(grupos.values()).map(x => ({ mes: x.mes, unidade: x.unidade, departamento: x.departamento, registros: x.registros, soma: x.soma, pessoas: x._p.size, dist: x.dist }));
    if (!out.length) throw new Error('Não encontrei nenhum registro de humor com data e nota (1 a 5).');
    const meses = out.map(x => x.mes).sort();
    return { linhas: out, avisos: ignoradas ? [`${ignoradas} linha(s) sem data ou nota válida foram ignoradas.`] : [], resumo: { inicio: meses[0], fim: meses[meses.length - 1], registros: out.reduce((s, x) => s + x.registros, 0) } };
  }

  // ---------------------------------------------------------------------
  // Notas da Pesquisa de Engajamento → engajamento_notas (dia × unidade × departamento × dimensão)
  // ---------------------------------------------------------------------
  function parseEngajamentoNotas(wb) {
    const rows = escolherAba(wb, ['Respostas', 'pesquisa_engajamento'], ['Unidade', 'Departamento', 'Dimensão', 'Resposta', 'Data'], 4, 'Pesquisa de Engajamento — respostas');
    const grupos = new Map();
    let ignoradas = 0;
    for (const row of rows) {
      const g = leitor(row);
      const dia = dataBR(g('Data', 'Data da resposta'));
      const nota = I.num(g('Resposta', 'Nota'));
      let dim = txt(g('Dimensão', 'Dimensao'));
      const pergunta = norm(g('Pergunta'));
      if (!dim && pergunta.includes('recomendaria')) dim = 'NPS';
      if (!dia || nota == null || !dim) { ignoradas++; continue; }
      const nps = norm(dim) === 'nps';
      if (!nps && (nota < 1 || nota > 5)) { ignoradas++; continue; }
      const unidade = txt(g('Unidade')), departamento = txt(g('Departamento'));
      const k = [dia, norm(unidade), norm(departamento), norm(dim)].join('\u0001');
      if (!grupos.has(k)) grupos.set(k, { dia, unidade, departamento, dimensao: nps ? 'NPS' : dim, soma: 0, n: 0, promotores: 0, detratores: 0 });
      const x = grupos.get(k);
      x.soma += nota; x.n++;
      if (nps) { if (nota >= 9) x.promotores++; else if (nota <= 6) x.detratores++; }
    }
    const out = Array.from(grupos.values());
    if (!out.length) throw new Error('Não encontrei respostas com data, dimensão e nota.');
    const dias = out.map(x => x.dia).sort();
    return { inicio: dias[0], fim: dias[dias.length - 1], linhas: out, avisos: ignoradas ? [`${ignoradas} linha(s) sem data, dimensão ou nota válida foram ignoradas.`] : [] };
  }

  // ---------------------------------------------------------------------
  // 61. Pesquisa de Satisfação → satisfacao_suporte (pesquisa × unidade × departamento)
  // ---------------------------------------------------------------------
  const AREA_NOME = {
    'financeiro': 'Financeiro', 'compras': 'Compras', 'recrutamento e selecao': 'Recrutamento e Seleção',
    'dp': 'DP', 'ti': 'TI', 'manutencao': 'Manutenção', 'auditoria': 'Auditoria', 'administrativo': 'Administrativo',
    'marketing': 'Marketing', 'juridico': 'Jurídico', 'dho': 'DHO', 't&d': 'T&D'
  };
  function nomeArea(bruto) {
    const n = norm(bruto);
    return AREA_NOME[n] || String(bruto).trim().toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
  }

  function parseSatisfacao(wb) {
    const rows = escolherAba(wb, ['Base Original'], ['PESQUISA', 'Unidade', 'Departamento', 'Posição na empresa', 'Financeiro - 0 a 10'], 3, '61. Pesquisa de Satisfação');
    const colunasArea = Object.keys(rows[0]).map(k => ({ k, m: /^(.*?)\s*-\s*0 a 10$/i.exec(String(k).trim()) })).filter(x => x.m).map(x => ({ k: x.k, area: nomeArea(x.m[1]) }));
    if (!colunasArea.length) throw new Error('Não encontrei as colunas de nota das áreas ("Financeiro - 0 a 10", "DP - 0 a 10"...).');
    const grupos = new Map();
    let ignoradas = 0;
    for (const row of rows) {
      const g = leitor(row);
      const pesquisa = mesBR(g('PESQUISA'));
      if (!pesquisa) { ignoradas++; continue; }
      const unidade = txt(g('Unidade')), departamento = txt(g('Departamento'));
      const k = pesquisa + '\u0001' + norm(unidade) + '\u0001' + norm(departamento);
      if (!grupos.has(k)) grupos.set(k, { pesquisa, unidade, departamento, respondentes: 0, areas: {} });
      const x = grupos.get(k);
      x.respondentes++;
      for (const c of colunasArea) {
        const v = I.num(row[c.k]);
        if (v == null || v < 0 || v > 10) continue;
        const a = x.areas[c.area] || (x.areas[c.area] = { soma: 0, n: 0 });
        a.soma += v; a.n++;
      }
    }
    const out = Array.from(grupos.values());
    if (!out.length) throw new Error('Não encontrei respostas com a coluna PESQUISA preenchida.');
    const meses = out.map(x => x.pesquisa).sort();
    return { linhas: out, avisos: ignoradas ? [`${ignoradas} linha(s) sem a data da PESQUISA foram ignoradas.`] : [], resumo: { inicio: meses[0], fim: meses[meses.length - 1], respondentes: out.reduce((s, x) => s + x.respondentes, 0) } };
  }

  window.HUB_PARSERS_BOLETIM = { parseHumor, parseEngajamentoNotas, parseSatisfacao, _internal: { dataBR, mesBR, norm } };
})();
