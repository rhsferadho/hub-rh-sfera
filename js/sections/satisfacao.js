// Indicadores → Pesquisa de Satisfação (com o Suporte do Escritório).
// Gestores avaliam todo mês cada área do Escritório: nota de 0 a 10, "O que
// melhorar?" e comentário. DADOS SIGILOSOS: cada pessoa vê só as áreas liberadas
// no perfil (Cadastro de Acessos) e, sem a visão completa, só o total da área —
// nunca a loja/operação de quem respondeu. Regras no banco: supabase-satisfacao.sql;
// cálculos: metrics-satisfacao.js; dados: dal-satisfacao.js.
(function () {
  const U = HUB_UTILS;
  const M = HUB_METRICS_SATISFACAO;
  const { kpi, empty, card } = HUB_UI;
  const esc = U.escapeHtml;

  const state = { ciclo: '', area: '', janela: 12, busca: '', ordem: 'menor', todos: false };

  const STYLE = `<style>
    .sf-top{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px}
    .sf-top label{display:flex;flex-direction:column;gap:4px;font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}
    .sf-top select,.sf-ctl select,.sf-ctl input[type=search]{padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;font-family:inherit;color:var(--text);background:#fff;min-width:170px}
    .sf-sigilo{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:#7a3e00;background:#FFF4E0;border:1px solid #F5D9A8;border-radius:8px;padding:7px 10px;margin-bottom:2px}
    .sf-sigilo svg{width:15px;height:15px;flex:none;stroke:currentColor;fill:none;stroke-width:2}
    .sf-note{font-size:11px;color:var(--muted);margin-top:8px;line-height:1.5}
    #sec-ind-satisfacao .kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
    @media (min-width:800px){#sec-ind-satisfacao .kpi-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
    @media (min-width:1150px){#sec-ind-satisfacao .kpi-grid{grid-template-columns:repeat(5,minmax(0,1fr))}}
    #sec-ind-satisfacao .card{margin-bottom:0}
    .sf-gap{height:16px}
    .sf-rank td,.sf-rank th{white-space:nowrap}
    .sf-rank tbody tr{cursor:pointer}
    .sf-rank tbody tr:hover td{background:#F7F9FC}
    .sf-bar{position:relative;min-width:140px;height:10px;border-radius:5px;background:var(--bg)}
    .sf-bar i{display:block;height:100%;border-radius:5px}
    .sf-cell{display:flex;align-items:center;gap:8px}
    .sf-cell b{min-width:30px;text-align:right;font-size:12.5px}
    .sf-var{font-size:11px;font-weight:700}
    .sf-var.up{color:#0f8a4c}.sf-var.down{color:var(--critical)}.sf-var.eq{color:var(--muted)}
    .sf-heat td,.sf-heat th{text-align:center;padding:6px 7px;white-space:nowrap;font-size:11.5px}
    .sf-heat td:first-child,.sf-heat th:first-child{text-align:left;position:sticky;left:0;background:#fff;z-index:1;font-weight:600}
    .sf-heat th:first-child{background:#F7F9FC;z-index:2}
    .sf-heat td.v{font-weight:700;border-radius:4px}
    .sf-heat tbody tr.click{cursor:pointer}
    .sf-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--text2);margin-top:8px}
    .sf-legend span{display:inline-flex;align-items:center;gap:5px}
    .sf-legend i{width:12px;height:12px;border-radius:3px;display:inline-block}
    .sf-ctl{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px;font-size:12px}
    .sf-ctl input[type=search]{min-width:240px}
    .sf-com{border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#fff}
    .sf-com-h{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px}
    .sf-chip{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:22px;padding:0 7px;border-radius:11px;font-size:11.5px;font-weight:800;color:#fff}
    .sf-tag{font-size:10.5px;padding:2px 8px;border-radius:10px;background:var(--bg);color:var(--text2)}
    .sf-tag.op{background:#EAF2FE;color:var(--p1)}
    .sf-com p{white-space:pre-wrap;font-size:12.5px;line-height:1.5;color:var(--text);margin:0}
    .sf-coms{max-height:620px;overflow:auto;padding-right:4px}
    .sf-back{background:none;border:none;color:var(--p1);cursor:pointer;font-size:12px;font-family:inherit;padding:0;margin-bottom:10px}
    table.dt td.num,table.dt th.num{text-align:right}
    .sf-mx td,.sf-mx th{text-align:center;white-space:nowrap;padding:6px 7px;font-size:11.5px}
    .sf-mx td:first-child,.sf-mx th:first-child{text-align:left;position:sticky;left:0;background:#fff;z-index:1;font-weight:600}
    .sf-mx th:first-child{background:#F7F9FC;z-index:2}
    .sf-mx td.v{font-weight:700}
    .sf-mx small{display:block;font-weight:400;color:var(--muted);font-size:9.5px}
  </style>`;

  const pct = v => v == null ? '—' : U.fmtPct(v, 0);

  // Participação de todas as lojas e áreas (quem respondeu ou não): confidencial,
  // só o Administrador (permissão própria, fora de todos os presets). As contas são
  // as do Boletim da Liderança (js/metrics-boletim.js): respondentes por loja da
  // planilha 16 e gestores aptos = ativos com a tag pesquisa.satisfação.
  const PERM_PARTICIPACAO = 'indicadores.satisfacao_participacao';
  const veParticipacao = () => HUB_PERMISSIONS.hasPerm(window.HUB_USER, PERM_PARTICIPACAO);
  const corNota = v => { const f = M.faixa(v); return f ? f.cor : 'var(--muted)'; };
  function varHtml(v, fmt) {
    if (v == null) return '<span class="sf-var eq">—</span>';
    const t = fmt(v);
    const cls = t.startsWith('▲') ? 'up' : t.startsWith('▼') ? 'down' : 'eq';
    return `<span class="sf-var ${cls}">${t}</span>`;
  }
  function barraNota(v) {
    if (v == null) return '—';
    return `<div class="sf-cell"><div class="sf-bar"><i style="width:${Math.max(2, v * 10)}%;background:${corNota(v)}"></i></div><b style="color:${corNota(v)}">${M.fmtNota(v)}</b></div>`;
  }
  function chart(id, h) { return `<div class="chart-h" style="height:${h || 280}px"><canvas id="${id}"></canvas></div>`; }

  // ---- Topo ----------------------------------------------------------------
  function topo(ctx) {
    const { idx, acesso } = ctx;
    const ciclos = idx.ciclos.slice().reverse();
    const areas = idx.areas;
    const optAreas = (areas.length > 1 ? [`<option value="">Visão geral${acesso.completo ? ' do Escritório' : ' das suas áreas'}</option>`] : [])
      .concat(areas.map(a => `<option value="${esc(a)}"${a === state.area ? ' selected' : ''}>${esc(a)}</option>`));
    const sigilo = acesso.completo
      ? 'Dados sigilosos · visão completa: todas as áreas, com o recorte por operação e loja.'
      : `Dados sigilosos · você vê: <b>${esc(areas.join(', ') || '—')}</b> (só o total da área, sem identificar lojas).`;
    return `<div class="sf-top">
      <label>Ciclo<select id="sf-ciclo">${ciclos.map(m => `<option value="${m}"${m === state.ciclo ? ' selected' : ''}>${esc(M.rotuloCicloLongo(m))}</option>`).join('')}</select></label>
      <label>Área<select id="sf-area">${optAreas.join('')}</select></label>
      <label>Evolução<select id="sf-janela">${[[6, 'Últimos 6 ciclos'], [12, 'Últimos 12 ciclos'], [0, 'Todo o histórico']].map(([v, t]) => `<option value="${v}"${state.janela === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <div class="sf-sigilo">${HUB_ICON('lock')}<span>${sigilo}</span></div>
    </div>`;
  }

  function janelaCiclos(idx) {
    const ate = idx.ciclos.filter(m => m <= state.ciclo);
    return state.janela ? ate.slice(-state.janela) : ate;
  }

  // ---- Visão geral ---------------------------------------------------------
  function viewGeral(ctx) {
    const { idx, acesso, respostas } = ctx;
    const g = M.visaoGeral(idx, state.ciclo, ctx.ciclosTab);
    if (!g.areas.length) return empty('Nenhuma área avaliada neste ciclo.');
    const mes = M.rotuloCiclo(state.ciclo);
    const fx = M.faixa(g.geral.media), zn = M.zonaNps(g.geral.nps);
    const partSub = g.aptos ? `${U.fmtPct(g.participacao, 0)} de ${U.fmtInt(g.aptos)} gestores aptos` : 'sem a base de aptos neste ciclo';
    const varResp = g.respondentesAnt != null && g.respondentes != null ? g.respondentes - g.respondentesAnt : null;
    const kpis = `<div class="kpi-grid">
      ${kpi(acesso.completo ? 'Nota média do Escritório' : 'Nota média das suas áreas', M.fmtNota(g.geral.media), `${fx ? fx.rotulo : ''} ${varHtml(g.varNota, M.fmtVarNota)} vs pesquisa ${g.cicloAnterior ? M.rotuloMes(g.cicloAnterior) : '—'}`, fx ? fx.cor : null)}
      ${kpi('NPS', M.fmtNps(g.geral.nps), `${zn ? zn.rotulo : ''} ${varHtml(g.varNps, M.fmtVarNps)}`, zn ? zn.cor : null)}
      ${kpi('Gestores que responderam', g.respondentes != null ? U.fmtInt(g.respondentes) : '—', partSub + (varResp != null ? ` · ${varResp >= 0 ? '+' : '−'}${Math.abs(varResp)} vs ciclo anterior` : ''))}
      ${kpi('Melhor avaliada', esc(g.melhor ? g.melhor.area : '—'), g.melhor ? `nota ${M.fmtNota(g.melhor.atual.media)} · NPS ${M.fmtNps(g.melhor.atual.nps)}` : '', '#0f8a4c')}
      ${g.pior ? kpi('Menor nota', esc(g.pior.area), `nota ${M.fmtNota(g.pior.atual.media)} · NPS ${M.fmtNps(g.pior.atual.nps)}`, corNota(g.pior.atual.media)) : ''}
    </div>`;

    const rank = card(`Ranking das áreas — ${esc(mes)}`, 'trophy', `
      <div class="table-wrap"><table class="dt sf-rank"><thead><tr><th>Área</th><th>Nota média</th><th>Var.</th><th class="num">NPS</th><th class="num">Detratores (0-6)</th><th>Principal ponto a melhorar</th><th class="num">Respostas</th></tr></thead><tbody>
      ${g.areas.map(a => `<tr data-area="${esc(a.area)}"><td><b>${esc(a.area)}</b></td><td>${barraNota(a.atual.media)}</td><td>${varHtml(a.varNota, M.fmtVarNota)}</td><td class="num" style="color:${(M.zonaNps(a.atual.nps) || {}).cor}"><b>${M.fmtNps(a.atual.nps)}</b></td><td class="num">${pct(a.atual.pctDetratores)}</td><td>${esc(a.atual.principal || '—')}${a.atual.pctNada != null ? ` <span class="sf-tag" title="Respostas que marcaram só 'Nada a melhorar'">${U.fmtPct(a.atual.pctNada, 0)} nada a melhorar</span>` : ''}</td><td class="num">${U.fmtInt(a.atual.n)}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="sf-note">Clique numa área para ver a evolução, o que melhorar e os comentários. Variação contra o ciclo anterior em que a área foi avaliada.</p>`, { full: true });

    const ciclos = janelaCiclos(idx);
    const heat = card('Evolução por área — nota média por ciclo', 'barChart', `
      <div class="table-wrap sf-heat-wrap" style="max-height:none"><table class="dt sf-heat"><thead><tr><th>Área</th>${ciclos.map(m => `<th title="Avalia ${esc(M.rotuloMes(M.mesReferencia(m)))}">${esc(M.rotuloMes(m))}</th>`).join('')}</tr></thead><tbody>
      ${M.mapaCalor(idx, ciclos).map(l => `<tr class="click" data-area="${esc(l.area)}"><td>${esc(l.area)}</td>${l.celulas.map(c => {
        if (!c.s || c.s.media == null) return '<td style="color:var(--muted)">—</td>';
        const f = M.faixa(c.s.media);
        return `<td class="v" style="background:${f.fundo};color:${f.cor}" title="Pesquisa ${esc(M.rotuloCiclo(c.ciclo))}: nota ${M.fmtNota(c.s.media)} · NPS ${M.fmtNps(c.s.nps)} · ${c.s.n} respostas">${M.fmtNota(c.s.media)}</td>`;
      }).join('')}</tr>`).join('')}
      </tbody></table></div>${legendaFaixas()}<p class="sf-note">Colunas = mês em que a pesquisa foi aplicada; cada pesquisa avalia o mês anterior (a de set/26 avalia agosto).</p>`, { full: true });

    const evo = card('Evolução geral', 'trendUp', chart('c-sf-evo-geral', 280) + `<p class="sf-note">Nota média de todas as respostas ${acesso.completo ? 'do Escritório' : 'das suas áreas'} no ciclo (linha azul, 0 a 10) e NPS (tracejada, −100 a +100).</p>`);
    const melh = card(`O que melhorar? — ${esc(mes)}`, 'lightbulb', chart('c-sf-melh-geral', 240) + '<p class="sf-note">% das avaliações em que cada ponto foi marcado (pode marcar mais de um), somando as áreas.</p>');

    let mx = '';
    if (acesso.completo) {
      const ops = M.matrizOperacoes(respostas, state.ciclo, g.areas.map(a => a.area));
      if (ops.length) {
        const areasOrd = g.areas.map(a => a.area);
        mx = '<div class="sf-gap"></div>' + card(`Nota por operação × área — ${esc(mes)}`, 'building', `
          <div class="table-wrap" style="max-height:none"><table class="dt sf-mx"><thead><tr><th>Operação</th><th>Geral</th>${areasOrd.map(a => `<th>${esc(a)}</th>`).join('')}</tr></thead><tbody>
          ${ops.map(o => `<tr><td>${esc(o.nome)}</td>${[o.total].concat(o.areas).map(s => {
            if (!s || s.media == null) return '<td style="color:var(--muted)">—</td>';
            const f = M.faixa(s.media);
            return `<td class="v" style="background:${f.fundo};color:${f.cor}" title="${s.n} respostas · NPS ${M.fmtNps(s.nps)}">${M.fmtNota(s.media)}<small>${s.n} resp.</small></td>`;
          }).join('')}</tr>`).join('')}
          </tbody></table></div>
          <p class="sf-note">Visão completa (RH): mostra de onde vêm as notas. Nas lojas, 1 respondente costuma ser o gerente — não repasse este recorte às áreas avaliadas.</p>`, { full: true });
      }
    }

    return kpis + rank + '<div class="sf-gap"></div>' + heat + '<div class="sf-gap"></div>' + `<div class="grid2">${evo}${melh}</div>` + mx + cardParticipacao() + comoLer(acesso);
  }

  // ---- Participação por loja (só Administrador) -----------------------------
  function cardParticipacao() {
    if (!veParticipacao()) return '';
    return '<div class="sf-gap"></div>' + card(`Participação de todas as lojas e áreas — ${esc(M.rotuloCiclo(state.ciclo))}`, 'building',
      `<div class="sf-sigilo" style="margin-bottom:10px">${HUB_ICON('lock')}<span>Confidencial · visível só para o Administrador.</span></div><div id="sf-part">${tabelaParticipacao()}</div>`, { full: true });
  }

  function tabelaParticipacao() {
    if (!HUB_BOLETIM.jaCarregado()) return '<p class="sf-note">Carregando a participação por loja...</p>';
    const MB = HUB_METRICS_BOLETIM;
    let calc;
    try { calc = MB.calcularMes(M.mesISO(state.ciclo)); }
    catch (err) { return `<p class="sf-note">Não consegui calcular a participação: ${esc(err.message || '')}</p>`; }
    const linhas = [];
    for (const o of MB.OPERACOES) for (const l of calc.operacoes[o.id].lojas) {
      const x = { op: o.nome, nome: l.nome, resp: l.base.satisfacao_respondentes, aptos: l.base.satisfacao_aptos };
      if (x.aptos || x.resp) linhas.push(x);
    }
    if (!linhas.length) return '<p class="sf-note">Nenhuma loja ou área com gestores aptos ou respostas neste ciclo.</p>';
    const pctDe = x => x.aptos ? Math.min(1, x.resp / x.aptos) : null;
    const ordem = x => pctDe(x) == null ? 2 : pctDe(x);
    linhas.sort((a, c) => ordem(a) - ordem(c) || a.op.localeCompare(c.op, 'pt-BR') || a.nome.localeCompare(c.nome, 'pt-BR'));
    const badge = (txt, fundo, cor) => `<span class="badge" style="background:${fundo};color:${cor}">${txt}</span>`;
    const situ = x => !x.resp ? badge('Não respondeu', '#FDECEC', 'var(--critical)') : x.aptos && x.resp < x.aptos ? badge('Parcial', '#FFF6E0', '#9a6b00') : badge('Respondeu', '#E6F7F0', '#0f8a4c');
    const nao = linhas.filter(x => !x.resp).length;
    const t = linhas.reduce((a, x) => ({ resp: a.resp + x.resp, aptos: a.aptos + x.aptos }), { resp: 0, aptos: 0 });
    return `<div class="table-wrap" style="max-height:520px"><table class="dt"><thead><tr><th>Operação</th><th>Loja / área</th><th class="num">Gestores aptos</th><th class="num">Responderam</th><th class="num">Participação</th><th>Situação</th></tr></thead><tbody>
        ${linhas.map(x => `<tr><td>${esc(x.op)}</td><td>${esc(x.nome)}</td><td class="num">${U.fmtInt(x.aptos)}</td><td class="num">${U.fmtInt(x.resp)}</td><td class="num">${x.aptos ? U.fmtPct(pctDe(x), 0) : '—'}</td><td>${situ(x)}</td></tr>`).join('')}
        <tr style="font-weight:700;background:#F7F9FC"><td>Total</td><td></td><td class="num">${U.fmtInt(t.aptos)}</td><td class="num">${U.fmtInt(t.resp)}</td><td class="num">${t.aptos ? U.fmtPct(Math.min(1, t.resp / t.aptos), 0) : '—'}</td><td></td></tr>
      </tbody></table></div>
      <p class="sf-note">${nao} de ${linhas.length} lojas/áreas sem nenhuma resposta no ciclo. A pesquisa é anônima: a conta é por loja/área (gestores aptos = ativos com a tag pesquisa.satisfação no cadastro, foto de hoje), não por pessoa. Mais respostas que aptos indica gestor respondendo sem a tag.</p>`;
  }

  // Os dados por loja vêm do Boletim da Liderança, buscados só quando a tabela aparece.
  function carregarParticipacao(el) {
    const box = el.querySelector('#sf-part');
    if (!box || HUB_BOLETIM.jaCarregado()) return;
    HUB_BOLETIM.carregar().then(() => {
      HUB_METRICS_BOLETIM._invalidar();
      const b = el.querySelector('#sf-part');
      if (b) b.innerHTML = tabelaParticipacao();
    }).catch(err => {
      const b = el.querySelector('#sf-part');
      if (b) b.innerHTML = `<p class="sf-note">Não consegui carregar a participação por loja: ${esc(err.message || '')}</p>`;
    });
  }

  function legendaFaixas() {
    return `<div class="sf-legend">${M.FAIXAS.map((f, i) => `<span><i style="background:${f.fundo};border:1px solid ${f.cor}"></i>${f.rotulo} ${i === 0 ? '(≥ 9)' : i === M.FAIXAS.length - 1 ? '(< 7)' : `(${f.min} a ${String(f.min + 0.9).replace('.', ',')})`}</span>`).join('')}</div>`;
  }

  function comoLer(acesso) {
    return '<div class="sf-gap"></div>' + card('Como ler', 'info', `<div class="sf-note" style="font-size:12px;color:var(--text2)">
      <p><b>Ciclo</b>: a pesquisa aplicada num mês avalia o <b>mês anterior</b> — a de setembro avalia agosto, e assim por diante. Os ciclos levam o nome do mês da pesquisa, com o mês avaliado entre parênteses (ref.).</p>
      <p><b>Nota média</b>: média das notas de 0 a 10 dadas no ciclo. Faixas: ótimo ≥ 9, bom 8 a 8,9, atenção 7 a 7,9, crítico abaixo de 7.</p>
      <p><b>NPS</b>: % de notas 9-10 (promotores) − % de notas 0-6 (detratores), de −100 a +100. Zonas: excelência ≥ 75, qualidade 50 a 74, aperfeiçoamento 0 a 49, crítica abaixo de 0.</p>
      <p><b>Gestores aptos</b>: ativos com a tag <i>pesquisa.satisfação</i> no cadastro (foto do dia do upload, mesma regra do Boletim).</p>
      <p><b>Atenção</b>: há notas 0 dadas por quem não usa a área ("Não utilizo", "Desconheço o setor"). Elas puxam a média para baixo; vale incluir a opção "Não utilizo" no formulário.</p>
      ${acesso.completo ? '' : '<p><b>Sigilo</b>: você vê só as áreas liberadas no seu acesso, sem a loja ou operação de quem respondeu. Comentários são de gestores identificáveis por quem conhece o contexto — trate como confidencial.</p>'}
    </div>`, { full: true });
  }

  // ---- Página da área --------------------------------------------------------
  function viewArea(ctx, area) {
    const { idx, acesso, respostas } = ctx;
    const r = M.resumoArea(idx, area, state.ciclo);
    const voltar = idx.areas.length > 1 ? '<button type="button" class="sf-back" id="sf-voltar">← Voltar à visão geral</button>' : '';
    if (!r.atual || !r.atual.n) return voltar + empty(`${esc(area)} não foi avaliada na ${esc(M.rotuloCicloLongo(state.ciclo))}.`, 'Escolha outro ciclo.');
    const s = r.atual, fx = M.faixa(s.media), zn = M.zonaNps(s.nps);
    const vs = r.cicloAnterior ? ` vs pesquisa ${M.rotuloMes(r.cicloAnterior)}` : '';
    const mes = M.rotuloCiclo(state.ciclo);
    const kpis = `<div class="kpi-grid">
      ${kpi('Nota média', M.fmtNota(s.media), `${fx.rotulo} ${varHtml(r.varNota, M.fmtVarNota)}${vs}`, fx.cor)}
      ${kpi('NPS', M.fmtNps(s.nps), `${zn.rotulo} ${varHtml(r.varNps, M.fmtVarNps)}`, zn.cor)}
      ${kpi('Promotores (9-10)', pct(s.pctPromotores), `${U.fmtInt(s.promotores)} de ${U.fmtInt(s.n)}`, '#0f8a4c')}
      ${kpi('Detratores (0-6)', pct(s.pctDetratores), `${U.fmtInt(s.detratores)} de ${U.fmtInt(s.n)}`, 'var(--critical)')}
      ${kpi('Avaliações', U.fmtInt(s.n), r.anterior ? `${U.fmtInt(r.anterior.n)} no ciclo anterior` : '')}
    </div>`;

    const extra = M.distribuicaoExtra((idx.porArea.get(area).get(state.ciclo)) || []);
    const blocos = [
      card(`Evolução — ${esc(area)}`, 'trendUp', chart('c-sf-evo', 290) + '<p class="sf-note">Nota média (linha azul, 0 a 10) e NPS (tracejada, −100 a +100) por ciclo.</p>'),
      card(`Distribuição das notas — ${esc(mes)}`, 'barChart', chart('c-sf-dist', 290) + '<p class="sf-note">Vermelho: detratores (0-6) · amarelo: neutros (7-8) · verde: promotores (9-10).</p>'),
      card(`O que melhorar? — ${esc(mes)}`, 'lightbulb', chart('c-sf-melh', 230) + tabelaMelhorar(idx, area))
    ];
    if (extra.length) blocos.push(card(`Reuniões do time com a loja no mês — ${esc(mes)}`, 'handshake', chart('c-sf-extra', 230) + '<p class="sf-note">Pergunta "Quantas reuniões o time realizou com você este mês?".</p>'));
    if (acesso.completo) blocos.push(card(`Nota por operação — ${esc(mes)}`, 'building', tabelaOperacoes(M.porOperacao(respostas, state.ciclo, area))));

    let lojas = '';
    if (acesso.completo) {
      const ls = M.porLoja(respostas, state.ciclo, area);
      if (ls.length) lojas = '<div class="sf-gap"></div>' + card(`Por loja / departamento — ${esc(mes)}`, 'pin', `<details><summary style="cursor:pointer;font-size:12px;color:var(--p1)">Mostrar ${ls.length} lojas/departamentos (menor nota primeiro)</summary>
        <div class="table-wrap" style="margin-top:10px;max-height:480px"><table class="dt"><thead><tr><th>Operação</th><th>Unidade</th><th>Departamento</th><th>Nota</th><th>O que melhorar</th></tr></thead><tbody>
        ${ls.map(l => `<tr><td>${esc(l.operacao)}</td><td>${esc(l.unidade || '—')}</td><td>${esc(l.departamento || '—')}</td><td>${barraNota(l.s.media)}</td><td>${esc(Object.keys(l.s.melhorar).filter(k => k !== M.NADA).join(', ') || (l.s.melhorar[M.NADA] ? M.NADA : '—'))}</td></tr>`).join('')}
        </tbody></table></div></details>
        <p class="sf-note">Visão completa (RH). Loja com 1 respondente identifica o gerente — não repasse à área avaliada.</p>`, { full: true });
    }

    return voltar + kpis + `<div class="grid2">${blocos.join('')}</div>` + lojas + '<div class="sf-gap"></div>' + blocoComentarios(ctx, area) + comoLer(acesso);
  }

  function tabelaMelhorar(idx, area) {
    const pa = idx.porArea.get(area);
    const ant = M.resumoArea(idx, area, state.ciclo).cicloAnterior;
    const ult6 = Array.from(pa.keys()).filter(m => m <= state.ciclo).sort().slice(-6);
    const s = M.stats(pa.get(state.ciclo)), sa = ant ? M.stats(pa.get(ant)) : null;
    const s6 = M.stats(ult6.flatMap(m => pa.get(m)));
    const p = (st, k) => st && st.respostas ? (st.melhorar[k] || 0) / st.respostas : null;
    return `<div class="table-wrap" style="margin-top:8px"><table class="dt"><thead><tr><th>Ponto</th><th class="num">${esc(M.rotuloCiclo(state.ciclo))}</th><th class="num">Ciclo anterior</th><th class="num">Últimos 6 ciclos</th></tr></thead><tbody>
      ${M.MELHORAR.concat([M.NADA]).map(k => `<tr><td>${esc(k)}</td><td class="num"><b>${pct(p(s, k))}</b></td><td class="num">${pct(p(sa, k))}</td><td class="num">${pct(p(s6, k))}</td></tr>`).join('')}
    </tbody></table></div><p class="sf-note">% das avaliações da área em que o ponto foi marcado.</p>`;
  }

  function tabelaOperacoes(ops) {
    if (!ops.length) return empty('Sem respostas com loja neste ciclo.');
    return `<div class="table-wrap"><table class="dt"><thead><tr><th>Operação</th><th>Nota</th><th class="num">NPS</th><th class="num">Respostas</th></tr></thead><tbody>
      ${ops.map(o => `<tr><td>${esc(o.nome)}</td><td>${barraNota(o.s.media)}</td><td class="num">${M.fmtNps(o.s.nps)}</td><td class="num">${U.fmtInt(o.s.n)}</td></tr>`).join('')}
    </tbody></table></div><p class="sf-note">Visão completa (RH). Não repasse este recorte à área avaliada.</p>`;
  }

  function blocoComentarios(ctx, area) {
    return card(`Comentários — ${esc(area)} · ${esc(M.rotuloCiclo(state.ciclo))}`, 'message', `
      <div class="sf-ctl">
        <input type="search" id="sf-busca" placeholder="Buscar nos comentários" value="${esc(state.busca)}">
        <select id="sf-ordem"><option value="menor"${state.ordem === 'menor' ? ' selected' : ''}>Menor nota primeiro</option><option value="maior"${state.ordem === 'maior' ? ' selected' : ''}>Maior nota primeiro</option></select>
        <label class="chk"><input type="checkbox" id="sf-todos"${state.todos ? ' checked' : ''}>Mostrar também os sem conteúdo (".", "ok", "nada a declarar")</label>
      </div>
      <div id="sf-coms"></div>`, { full: true });
  }

  function desenharComentarios(ctx, area) {
    const box = document.getElementById('sf-coms');
    if (!box) return;
    const lista = M.comentarios(ctx.respostas, state.ciclo, area, { busca: state.busca, ordem: state.ordem, todos: state.todos });
    const total = M.comentarios(ctx.respostas, state.ciclo, area, { todos: true }).length;
    const cab = `<p class="sf-note" style="margin:0 0 10px">${U.fmtInt(lista.length)} de ${U.fmtInt(total)} comentários${state.todos ? '' : ' (sem os vazios)'}. ${ctx.acesso.completo ? 'Visão completa: com a operação de origem.' : 'Sem loja ou operação de quem respondeu.'}</p>`;
    if (!lista.length) { box.innerHTML = cab + empty('Nenhum comentário neste recorte.'); return; }
    box.innerHTML = cab + '<div class="sf-coms">' + lista.map(c => `<div class="sf-com"><div class="sf-com-h">
        <span class="sf-chip" style="background:${corNota(c.nota)}" title="Nota dada à área">${c.nota == null ? '—' : U.fmtInt(c.nota)}</span>
        ${c.melhorar.map(m => `<span class="sf-tag">${esc(m)}</span>`).join('')}
        ${c.operacao ? `<span class="sf-tag op">${esc(c.operacao)}</span>` : ''}
      </div><p>${esc(c.comentario)}</p></div>`).join('') + '</div>';
  }

  // ---- Gráficos ----------------------------------------------------------------
  const DL = '#16181D';
  function linhaNotaNps(id, serie) {
    HUB_CHART(id, {
      type: 'line',
      data: {
        labels: serie.map(x => M.rotuloMes(x.ciclo)),
        datasets: [
          { label: 'Nota média', data: serie.map(x => x.s && x.s.media != null ? +x.s.media.toFixed(2) : null), borderColor: '#1C7CEC', backgroundColor: '#1C7CEC', tension: .3, pointRadius: 3, spanGaps: true, yAxisID: 'y' },
          { label: 'NPS', data: serie.map(x => x.s && x.s.nps != null ? Math.round(x.s.nps) : null), borderColor: '#8A8F98', backgroundColor: '#8A8F98', borderDash: [5, 4], tension: .3, pointRadius: 2, spanGaps: true, yAxisID: 'y1' }
        ]
      },
      options: {
        layout: { padding: { top: 18, left: 6, right: 6 } },
        plugins: {
          legend: { display: true, labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: c => c.datasetIndex === 0 ? `Nota ${M.fmtNota(c.raw)}` : `NPS ${M.fmtNps(c.raw)}` } },
          datalabels: { display: c => c.datasetIndex === 0, color: DL, font: { size: 9, weight: '700' }, align: 'top', offset: 3, formatter: v => v == null ? '' : M.fmtNota(v) }
        },
        scales: {
          y: { min: 0, max: 10, ticks: { stepSize: 2 } },
          y1: { position: 'right', min: -100, max: 100, grid: { drawOnChartArea: false }, ticks: { stepSize: 50 } }
        }
      }
    });
  }

  function barras(id, labels, values, cores, opts) {
    opts = opts || {};
    HUB_CHART(id, {
      type: 'bar',
      data: { labels, datasets: [{ data: values, backgroundColor: cores, borderRadius: 5, maxBarThickness: 34 }] },
      options: {
        indexAxis: opts.horizontal ? 'y' : 'x',
        layout: { padding: opts.horizontal ? { right: 44 } : { top: 22 } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => opts.pct ? U.fmtPct(c.raw, 0) : U.fmtInt(c.raw) } },
          datalabels: { color: DL, font: { size: 10, weight: '700' }, anchor: 'end', align: opts.horizontal ? 'end' : 'top', formatter: v => opts.pct ? U.fmtPct(v, 0) : (v ? U.fmtInt(v) : '') }
        },
        scales: opts.horizontal
          ? { x: Object.assign({ grid: { display: true }, beginAtZero: true }, opts.pct ? { max: 1, ticks: { callback: v => U.fmtPct(v, 0) } } : {}), y: { grid: { display: false } } }
          : { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  function graficoMelhorar(id, st) {
    const ks = M.MELHORAR.concat([M.NADA]);
    const vals = ks.map(k => st.respostas ? (st.melhorar[k] || 0) / st.respostas : 0);
    barras(id, ks, vals, ks.map(k => k === M.NADA ? '#1baf7a' : '#eb6834'), { horizontal: true, pct: true });
  }

  function desenharGeral(ctx) {
    const { idx } = ctx;
    const ciclos = janelaCiclos(idx);
    const todas = m => idx.areas.flatMap(a => (idx.porArea.get(a).get(m)) || []);
    linhaNotaNps('c-sf-evo-geral', ciclos.map(m => ({ ciclo: m, s: M.stats(todas(m)) })));
    graficoMelhorar('c-sf-melh-geral', M.stats(todas(state.ciclo)));
  }

  function desenharArea(ctx, area) {
    const { idx } = ctx;
    const pa = idx.porArea.get(area);
    if (!pa || !pa.has(state.ciclo)) return;
    linhaNotaNps('c-sf-evo', M.serieArea(idx, area, janelaCiclos(idx)));
    const s = M.stats(pa.get(state.ciclo));
    barras('c-sf-dist', s.dist.map((_, i) => String(i)), s.dist, s.dist.map((_, i) => i >= 9 ? '#1baf7a' : i >= 7 ? '#eda100' : '#e34948'));
    graficoMelhorar('c-sf-melh', s);
    const ex = M.distribuicaoExtra(pa.get(state.ciclo));
    if (ex.length) barras('c-sf-extra', ex.map(e => e[0]), ex.map(e => e[1]), ex.map(() => '#1C7CEC'));
  }

  // ---- Montagem ----------------------------------------------------------------
  function renderConteudo(el) {
    const acesso = M.acessoDe(window.HUB_USER);
    const D = window.HUB_SATISFACAO_DATA;
    const respostas = M.recortar(D.respostas || [], acesso);
    const idx = M.indexar(respostas);
    if (!idx.ciclos.length) {
      el.innerHTML = empty(acesso.completo ? 'Nenhuma resposta da Pesquisa de Satisfação importada ainda.' : 'Ainda não há respostas para as áreas liberadas no seu acesso.',
        acesso.completo ? 'Em Administração → Upload de Planilhas, envie a planilha "16. Base Pesquisa Feedz".' : 'Se você deveria ver alguma área, peça ao administrador do Hub para liberá-la no seu cadastro.');
      return;
    }
    if (!state.ciclo || !idx.ciclos.includes(state.ciclo)) state.ciclo = idx.ciclos[idx.ciclos.length - 1];
    if (idx.areas.length === 1) state.area = idx.areas[0];
    else if (state.area && !idx.areas.includes(state.area)) state.area = '';
    const ctx = { acesso, respostas, idx, ciclosTab: D.ciclos || [] };

    el.innerHTML = STYLE + topo(ctx) + (state.area ? viewArea(ctx, state.area) : viewGeral(ctx));

    const re = () => renderConteudo(el);
    el.querySelector('#sf-ciclo').addEventListener('change', e => { state.ciclo = e.target.value; re(); });
    el.querySelector('#sf-area').addEventListener('change', e => { state.area = e.target.value; state.busca = ''; re(); });
    el.querySelector('#sf-janela').addEventListener('change', e => { state.janela = Number(e.target.value); re(); });
    el.querySelectorAll('[data-area]').forEach(tr => tr.addEventListener('click', () => { state.area = tr.dataset.area; state.busca = ''; re(); el.scrollIntoView({ block: 'start' }); }));
    const voltar = el.querySelector('#sf-voltar');
    if (voltar) voltar.addEventListener('click', () => { state.area = ''; re(); });

    if (state.area) {
      desenharArea(ctx, state.area);
      desenharComentarios(ctx, state.area);
      const busca = el.querySelector('#sf-busca');
      if (busca) {
        let t = null;
        busca.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.busca = busca.value; desenharComentarios(ctx, state.area); }, 200); });
        el.querySelector('#sf-ordem').addEventListener('change', e => { state.ordem = e.target.value; desenharComentarios(ctx, state.area); });
        el.querySelector('#sf-todos').addEventListener('change', e => { state.todos = e.target.checked; desenharComentarios(ctx, state.area); });
      }
    } else {
      desenharGeral(ctx);
      carregarParticipacao(el);
      // Mapa de calor abre no ciclo mais recente (fim da tabela).
      el.querySelectorAll('.sf-heat-wrap').forEach(w => { w.scrollLeft = w.scrollWidth; });
    }
  }

  // Os dados só são buscados na primeira abertura da tela na sessão (ou depois de
  // "Atualizar dados" / do upload do card 16, que descartam o cache).
  function renderSatisfacao(el) {
    const acesso = M.acessoDe(window.HUB_USER);
    if (!acesso.modulo) { el.innerHTML = empty('Acesso restrito.'); return; }
    if (!acesso.completo && !acesso.areas.length) {
      el.innerHTML = empty('Nenhuma área da Pesquisa de Satisfação liberada para o seu acesso.', 'Peça ao administrador do Hub para marcar, no seu cadastro, as áreas que você acompanha.');
      return;
    }
    if (HUB_SATISFACAO.jaCarregado()) return renderConteudo(el);
    el.innerHTML = empty('Carregando a Pesquisa de Satisfação...');
    HUB_SATISFACAO.carregar().then(() => {
      if (window.HUB_RENDER_CURRENT) window.HUB_RENDER_CURRENT();
      else renderConteudo(el);
    }).catch(err => {
      el.innerHTML = empty('Não consegui carregar a Pesquisa de Satisfação.', esc(err.message || ''));
    });
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderSatisfacao = renderSatisfacao;
})();
