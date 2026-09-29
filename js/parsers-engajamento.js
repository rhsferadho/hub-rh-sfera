// Leitura das planilhas da Pesquisa de Engajamento — SÓ participação (quem foi
// convidado × quem respondeu, por unidade e departamento). Nenhuma resposta,
// nota ou comentário é lida daqui: a pesquisa é anônima e o módulo só conta.
//
// Duas planilhas alimentam o módulo (Administração → Upload de Planilhas):
//   • export "Participação" do Feedz (uma por pulso, reenviada a cada
//     atualização enquanto o pulso está aberto) → parseFeedzPulso
//   • "33. Pesquisa de Engajamento 2026.xlsx" (histórico dos pulsos, abas
//     Adesão e Respostas) → parseHistorico
(function () {
  const I = HUB_PARSERS._internal;
  const norm = h => String(h == null ? '' : h).normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();

  function aba(wb, nome) {
    const alvo = norm(nome);
    const real = (wb.SheetNames || []).find(n => norm(n) === alvo);
    return real ? wb.Sheets[real] : null;
  }
  function linhasBrutas(ws) {
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  }
  function linhasObjeto(ws, opts) {
    return XLSX.utils.sheet_to_json(ws, Object.assign({ defval: '', raw: true }, opts || {}));
  }
  function iso(y, m, d) {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  function inteiro(v) {
    const n = I.num(v);
    return n === null ? null : Math.round(n);
  }

  // Ano de referência do pulso: o da data de disparo dos convidados (mais
  // confiável que o título "Setembro 2026" quando o pulso vira o ano). O texto
  // vem como "25/09/2026 07:40:17" (dia/mês) — I.toISODate lê como mês/dia, então
  // o ano é extraído à parte.
  function anoDe(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getFullYear();
    const m = /(?:^|\D)(20\d{2})(?:\D|$)/.exec(String(v == null ? '' : v));
    return m ? parseInt(m[1], 10) : null;
  }
  function anoDosParticipantes(rows) {
    for (const r of rows) {
      const a = anoDe(r['data de disparo']);
      if (a) return a;
    }
    return null;
  }

  // Distribui `total` entre as contagens de forma proporcional (maior resto),
  // para que a soma das linhas feche exatamente com o total oficial.
  function escalarAoTotal(itens, total) {
    const soma = itens.reduce((s, i) => s + i.n, 0);
    if (!soma || soma === total) return;
    const parciais = itens.map(i => {
      const v = i.n * total / soma;
      return { i, base: Math.floor(v), resto: v - Math.floor(v) };
    });
    let sobra = total - parciais.reduce((s, p) => s + p.base, 0);
    parciais.sort((a, b) => b.resto - a.resto);
    for (const p of parciais) { p.i.n = p.base + (sobra > 0 && p.resto > 0 ? 1 : 0); if (sobra > 0 && p.resto > 0) sobra--; }
  }

  // Cabeçalho da aba participantes_periodo não está na primeira linha (a linha 1
  // é um aviso) — acha a linha que tem "Colaborador" e "Unidade".
  function participantesPeriodo(wb) {
    const ws = aba(wb, 'participantes_periodo');
    if (!ws) return [];
    const aoa = linhasBrutas(ws);
    const hi = aoa.findIndex(r => r.some(c => norm(c) === 'colaborador') && r.some(c => norm(c) === 'unidade'));
    if (hi < 0) return [];
    const head = aoa[hi].map(norm);
    return aoa.slice(hi + 1).filter(r => r.some(c => String(c).trim() !== '')).map(r => {
      const o = {};
      head.forEach((h, i) => { if (h && !(h in o)) o[h] = r[i]; });
      return o;
    });
  }

  // Gestor direto mais frequente entre os convidados de cada unidade+departamento:
  // é quem responde pela equipe (o líder do departamento tem o próprio gestor acima).
  function gestorPorDepartamento(rows) {
    const cont = new Map();
    for (const r of rows) {
      const g = I.str(r['gestor direto']);
      if (!g) continue;
      const k = norm(r['unidade']) + '|' + norm(r['departamento']);
      if (!cont.has(k)) cont.set(k, new Map());
      const m = cont.get(k);
      m.set(g, (m.get(g) || 0) + 1);
    }
    const out = new Map();
    for (const [k, m] of cont) {
      const ord = Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
      out.set(k, ord[0][0]);
    }
    return out;
  }

  // Lê uma tabela da aba Participação: acha a linha de cabeçalho e segue até a
  // primeira linha em branco.
  function lerTabela(aoa, ehCabecalho) {
    const hi = aoa.findIndex(ehCabecalho);
    if (hi < 0) return null;
    const rows = [];
    for (let i = hi + 1; i < aoa.length; i++) {
      if (String(aoa[i][0] == null ? '' : aoa[i][0]).trim() === '') break;
      rows.push(aoa[i]);
    }
    return rows;
  }

  // ---------------------------------------------------------------------
  // Export do Feedz (um pulso)
  // ---------------------------------------------------------------------
  function parseFeedzPulso(wb) {
    const ws = aba(wb, 'Participação');
    if (!ws) throw new Error('Não encontrei a aba "Participação" — este não parece o export da Pesquisa de Engajamento do Feedz.');
    const aoa = linhasBrutas(ws);
    const titulo = String(aoa[0] && aoa[0][0] || '');
    const sub = String(aoa[1] && aoa[1][0] || '');
    const participantes = participantesPeriodo(wb);

    const per = /(\d{1,2})\/(\d{1,2})\s+a\s+(\d{1,2})\/(\d{1,2})/i.exec(sub) || /(\d{1,2})\/(\d{1,2})\s+a\s+(\d{1,2})\/(\d{1,2})/i.exec(titulo);
    if (!per) throw new Error('Não encontrei o período do pulso (ex.: "de 25/09 a 01/10") no topo da aba Participação.');
    const [, d1, m1, d2, m2] = per.map(Number);
    const anoTitulo = /\b(20\d{2})\b/.exec(titulo);
    const ano = anoDosParticipantes(participantes) || (anoTitulo ? parseInt(anoTitulo[1], 10) : new Date().getFullYear());
    const inicio = iso(ano, m1, d1);
    const fim = iso(m2 < m1 ? ano + 1 : ano, m2, d2);

    const parcial = /parcial/i.test(sub);
    const ur = /(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(sub);
    const ultimaResposta = ur ? `${ur[1]}T${ur[2]}` : null;

    const avisos = [];
    const tabDep = lerTabela(aoa, r => norm(r[0]) === 'unidade' && norm(r[1]) === 'departamento' && norm(r[2]) === 'convidados') || [];
    const tabUn = lerTabela(aoa, r => norm(r[0]) === 'unidade' && norm(r[1]) === 'convidados') || [];
    if (!participantes.length && !tabDep.length) throw new Error('Não encontrei os convidados (aba participantes_periodo) nem a tabela por departamento (aba Participação).');

    // BASE DE CONVIDADOS: a lista da aba participantes_periodo é a fonte
    // confiável — a tabela por departamento da aba Participação às vezes
    // atribui departamentos à unidade errada (com 0 convidados) e perde gente.
    const linhasPorChave = new Map();
    const chave = (u, d) => norm(u) + '|' + norm(d);
    const nova = (u, d) => ({ unidade: I.str(u) || 'Sem unidade', departamento: I.str(d) || 'Sem departamento', convidados: 0, respondentes: 0, aprox: false });
    for (const p of participantes) {
      const k = chave(p['unidade'], p['departamento']);
      if (!linhasPorChave.has(k)) linhasPorChave.set(k, nova(p['unidade'], p['departamento']));
      linhasPorChave.get(k).convidados++;
    }
    if (!participantes.length) {
      avisos.push('Aba participantes_periodo ausente: usei a tabela por departamento da aba Participação (sem gestor).');
      for (const r of tabDep) {
        const l = nova(r[0], r[1]);
        l.convidados = inteiro(r[2]) || 0;
        linhasPorChave.set(chave(r[0], r[1]), l);
      }
    }

    // RESPONDENTES por departamento: da tabela da aba Participação quando o
    // departamento bate com a lista de convidados; caso contrário (os
    // departamentos que a tabela perde), pela contagem de envios na aba de
    // respostas — e depois fechados com o total oficial de cada unidade.
    const daTabela = new Map();
    for (const r of tabDep) daTabela.set(chave(r[0], r[1]), inteiro(r[3]) || 0);
    const envios = new Map();
    const wsRe = aba(wb, 'pesquisa_engajamento');
    if (wsRe) {
      const vistos = new Set();
      for (const r of linhasObjeto(wsRe)) {
        const o = {};
        for (const k of Object.keys(r)) o[norm(k)] = r[k];
        const k = chave(o['unidade'], o['departamento']);
        const id = k + '\u0001' + chaveEnvio(o['data da resposta']);
        if (vistos.has(id)) continue;
        vistos.add(id);
        envios.set(k, (envios.get(k) || 0) + 1);
      }
    }
    for (const [k, l] of linhasPorChave) {
      if (daTabela.has(k)) l.respondentes = daTabela.get(k);
      else { l.respondentes = envios.get(k) || 0; l.aprox = true; }
    }
    // Linhas da tabela que não existem na lista de convidados: só interessam se
    // tiverem respondentes (fora isso são as linhas "fantasma" com 0).
    for (const [k, n] of daTabela) if (!linhasPorChave.has(k) && n > 0) avisos.push(`Departamento da tabela sem convidados na lista: ${k.replace('|', ' / ')} (${n} resp.) — ignorado.`);

    // Fecha cada unidade com o total oficial (aba Participação, resumo por unidade).
    for (const r of tabUn) {
      const un = norm(r[0]);
      const oficial = inteiro(r[2]);
      if (oficial === null) continue;
      const doUn = Array.from(linhasPorChave.values()).filter(l => norm(l.unidade) === un);
      let soma = doUn.reduce((s, l) => s + l.respondentes, 0);
      const aprox = doUn.filter(l => l.aprox);
      while (soma > oficial && aprox.some(l => l.respondentes > 0)) {
        aprox.sort((a, b) => b.respondentes - a.respondentes)[0].respondentes--; soma--;
      }
      while (soma < oficial && aprox.some(l => l.respondentes < l.convidados)) {
        aprox.filter(l => l.respondentes < l.convidados).sort((a, b) => (b.convidados - b.respondentes) - (a.convidados - a.respondentes))[0].respondentes++; soma++;
      }
      if (soma !== oficial) avisos.push(`Unidade "${r[0]}": ${soma} respondentes nos departamentos e ${oficial} no resumo oficial.`);
    }

    const gestores = gestorPorDepartamento(participantes);
    const linhas = Array.from(linhasPorChave.entries()).map(([k, l]) => ({
      unidade: l.unidade, departamento: l.departamento,
      gestor: gestores.get(k) || null,
      convidados: l.convidados, respondentes: l.respondentes
    })).sort((a, b) => a.unidade.localeCompare(b.unidade, 'pt-BR') || a.departamento.localeCompare(b.departamento, 'pt-BR'));

    const somaConv = linhas.reduce((s, l) => s + l.convidados, 0);
    const somaResp = linhas.reduce((s, l) => s + l.respondentes, 0);

    // Totais do topo (CONVIDADOS / RESPONDERAM) — conferência final.
    const kr = aoa.findIndex(r => norm(r[0]) === 'convidados');
    const conv = kr >= 0 ? inteiro(aoa[kr + 1][0]) : null;
    const resp = kr >= 0 ? inteiro(aoa[kr + 1][2]) : null;
    if (conv !== null && conv !== somaConv) avisos.push(`Total de convidados do topo do arquivo (${conv}) difere da lista de convidados (${somaConv}).`);
    if (resp !== null && resp !== somaResp) avisos.push(`Total de respondentes do topo do arquivo (${resp}) difere da soma por departamento (${somaResp}).`);

    const unidades = new Set(linhas.map(l => l.unidade)).size;
    return {
      pulso: { inicio, fim, convidados: somaConv, respondentes: somaResp, parcial, ultima_resposta: ultimaResposta },
      linhas, avisos,
      resumo: { unidades, departamentos: linhas.length, convidados: somaConv, respondentes: somaResp }
    };
  }

  // ---------------------------------------------------------------------
  // Histórico (planilha 33): pulsos da aba Adesão + respondentes por
  // unidade/departamento reconstruídos da aba Respostas.
  // ---------------------------------------------------------------------
  function serialData(v) {
    // "Data" da aba Respostas: número serial do Excel, Date ou texto.
    return I.toISODate(v);
  }

  function chaveEnvio(v) {
    if (v instanceof Date) return String(v.getTime());
    return String(v);
  }

  function parseHistorico(wb) {
    const wsAd = aba(wb, 'Adesão');
    const wsRe = aba(wb, 'Respostas');
    if (!wsAd || !wsRe) throw new Error('Não encontrei as abas "Adesão" e "Respostas" — este não parece o arquivo "33. Pesquisa de Engajamento".');

    const pulsos = [];
    for (const r of linhasObjeto(wsAd)) {
      const o = {};
      for (const k of Object.keys(r)) o[norm(k)] = r[k];
      const ini = I.toISODate(o['inicio do pulso']);
      const fim = I.toISODate(o['final do pulso']);
      const conv = inteiro(o['participantes']);
      const resp = inteiro(o['respondentes']);
      if (!ini || !fim || conv === null || resp === null) continue;
      const n = /\d+/.exec(String(o['numero do pulso'] || ''));
      pulsos.push({ inicio: ini, fim, numero: n ? parseInt(n[0], 10) : null, convidados: conv, respondentes: resp });
    }
    if (!pulsos.length) throw new Error('A aba "Adesão" não trouxe nenhum pulso (colunas: Numero do Pulso, Participantes, Respondentes, Inicio do Pulso, Final do Pulso).');
    pulsos.sort((a, b) => a.inicio.localeCompare(b.inicio));

    // Um "envio" = todas as respostas da mesma pessoa, que saem com o mesmo
    // horário. Contam-se envios distintos por unidade+departamento+horário.
    const envios = new Map();
    for (const r of linhasObjeto(wsRe)) {
      const o = {};
      for (const k of Object.keys(r)) o[norm(k)] = r[k];
      const dia = serialData(o['data'] !== undefined && o['data'] !== '' ? o['data'] : o['data da resposta']);
      if (!dia) continue;
      const un = I.str(o['unidade']) || 'Sem unidade';
      const dp = I.str(o['departamento']) || 'Sem departamento';
      const bruto = o['data'] !== undefined && o['data'] !== '' ? o['data'] : o['data da resposta'];
      const k = un + '\u0001' + dp + '\u0001' + chaveEnvio(bruto);
      if (!envios.has(k)) envios.set(k, { un, dp, dia });
    }

    const cont = new Map();
    let fora = 0;
    for (const e of envios.values()) {
      const p = pulsos.find(x => e.dia >= x.inicio && e.dia <= x.fim);
      if (!p) { fora++; continue; }
      const k = p.inicio + '\u0001' + e.un + '\u0001' + e.dp;
      if (!cont.has(k)) cont.set(k, { pulso_inicio: p.inicio, unidade: e.un, departamento: e.dp, n: 0 });
      cont.get(k).n++;
    }
    // A contagem de envios passa de 0 a 5% do total oficial do pulso (uma
    // mesma pessoa pode gravar respostas em horários um pouco diferentes):
    // ajusta proporcionalmente para a soma dos departamentos fechar com o
    // total oficial da aba Adesão.
    const porPulso = new Map();
    for (const c of cont.values()) {
      if (!porPulso.has(c.pulso_inicio)) porPulso.set(c.pulso_inicio, []);
      porPulso.get(c.pulso_inicio).push(c);
    }
    for (const p of pulsos) if (porPulso.has(p.inicio)) escalarAoTotal(porPulso.get(p.inicio), p.respondentes);
    const linhas = Array.from(cont.values())
      .map(c => ({ pulso_inicio: c.pulso_inicio, unidade: c.unidade, departamento: c.departamento, respondentes: c.n }))
      .filter(l => l.respondentes > 0)
      .sort((a, b) => a.pulso_inicio.localeCompare(b.pulso_inicio) || a.unidade.localeCompare(b.unidade, 'pt-BR') || a.departamento.localeCompare(b.departamento, 'pt-BR'));

    const avisos = [];
    if (fora) avisos.push(`${fora} resposta(s) com data fora de qualquer pulso da aba Adesão foram ignoradas.`);
    return { pulsos, linhas, avisos, resumo: { pulsos: pulsos.length, linhas: linhas.length } };
  }

  window.HUB_PARSERS_ENGAJAMENTO = { parseFeedzPulso, parseHistorico };
})();
