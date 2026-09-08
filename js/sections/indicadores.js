// Montagem do HTML + gráficos de cada tela do módulo Indicadores (exceto
// Recrutamento, que fica em sections/recrutamento-dashboard.js, e exceto
// Administração, que fica em js/admin/*). Cada renderX(container, filters)
// recebe os indicadores já calculados por metrics-indicadores.js e só cuida
// de layout/gráficos — os componentes visuais (kpi/card/gráficos) vêm de
// ui-charts.js, compartilhados com o indicador ao vivo de Recrutamento.
(function () {
  const U = HUB_UTILS;
  const M = HUB_METRICS;
  const { kpi, empty, card, insightsList, noDataGate, barChart, lineChart, doughnutChart, topRows, rankingTable } = HUB_UI;

  function canUpload() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'admin.upload'); }

  // ==================================================================
  // DASHBOARD
  // ==================================================================
  function renderDashboard(el, f) {
    if (noDataGate(el, null, canUpload())) return;
    const d = M.dashboardMetrics(f);
    el.innerHTML = `
      <div class="kpi-grid">
        ${kpi('Colaboradores ativos', U.fmtInt(d.colab.ativos), `${U.fmtInt(d.colab.total)} no total (ativos+desativados)`, 'var(--p1)')}
        ${kpi('Turnover no período', U.fmtPct(d.rot.taxaTurnoverGeral), `${U.fmtInt(d.rot.totalDesligados)} desligamento(s)`, 'var(--critical)')}
        ${kpi('eNPS desligados', d.entr.nps === null ? '—' : d.entr.nps, `${U.fmtInt(d.entr.totalRespostas)} resposta(s)`, 'var(--p2)')}
        ${kpi('Celebrações', U.fmtInt(d.cel.total), 'no período', '#e87ba4')}
        ${kpi('Feedbacks', U.fmtInt(d.fb.total), 'no período', '#1baf7a')}
        ${kpi('1:1 realizados', U.fmtInt(d.oo.realizados), `de ${U.fmtInt(d.oo.total)} agendado(s)`, '#4a3aa7')}
        ${kpi('Conclusão treinamentos', U.fmtPct(d.tr.taxaConclusao), `${U.fmtInt(d.tr.totalInscricoes)} inscrição(ões)`, '#eda100')}
      </div>
      <div class="grid2">
        ${card('Colaboradores por unidade', '&#128101;', '<div class="chart-h"><canvas id="c-dash-unidade"></canvas></div>')}
        ${card('Desligamentos por mês', '&#128260;', '<div class="chart-h"><canvas id="c-dash-turnover"></canvas></div>')}
      </div>`;
    const pu = d.colab.porUnidade.slice(0, 10);
    barChart('c-dash-unidade', pu.map(x => x.label), pu.map(x => x.value));
    lineChart('c-dash-turnover', d.rot.serie.map(x => x.label), [{ label: 'Desligamentos', data: d.rot.serie.map(x => x.desligamentos) }]);
  }

  // ==================================================================
  // HEADCOUNT (Colaboradores)
  // ==================================================================
  function renderHeadcount(el, f) {
    if (noDataGate(el, ['colaboradores'], canUpload())) return;
    const d = M.colaboradoresMetrics(f);
    el.innerHTML = `
      <div class="kpi-grid">
        ${kpi('Headcount', U.fmtInt(d.total), 'Ativos + desativados (sem duplicidade)', 'var(--p1)')}
        ${kpi('Ativos', U.fmtInt(d.ativos), '', '#1baf7a')}
        ${kpi('Desativados', U.fmtInt(d.desativados), '', 'var(--warning)')}
        ${kpi('Tempo médio de casa', U.tenureLabel(Math.round(d.tempoMedioMeses)), '', '#4a3aa7')}
      </div>
      <div class="grid2">
        ${card('Headcount por unidade', '&#127970;', '<div class="chart-h"><canvas id="c-col-unidade"></canvas></div>')}
        ${card('Headcount por departamento', '&#128194;', '<div class="chart-h"><canvas id="c-col-depto"></canvas></div>')}
        ${card('Distribuição por sexo', '&#9878;&#65039;', '<div class="chart-h short"><canvas id="c-col-sexo"></canvas></div>')}
        ${card('Aniversariantes (próx. 30 dias)', '&#127874;', d.aniversariantes.length ? `<div class="table-wrap"><table class="dt"><thead><tr><th>Nome</th><th>Cargo</th><th>Data</th><th>Departamento</th></tr></thead><tbody>${d.aniversariantes.map(a => `<tr><td>${U.escapeHtml(a.nome)}</td><td>${U.escapeHtml(a.cargo || '')}</td><td>${U.fmtDateBR(a.data)}</td><td>${U.escapeHtml(a.departamento || '')}</td></tr>`).join('')}</tbody></table></div>` : empty('Nenhum aniversariante nos próximos 30 dias.'))}
        ${card('Lista de colaboradores', '&#128203;', `<div class="table-wrap"><table class="dt"><thead><tr><th>Nome</th><th>Cargo</th><th>Unidade</th><th>Departamento</th><th>Gestor</th><th>Situação</th><th>Admissão</th></tr></thead><tbody>${d.lista.slice(0, 300).map(r => `<tr><td>${U.escapeHtml(r.nome_completo || r.nome || '')}</td><td>${U.escapeHtml(r.cargo || '')}</td><td>${U.escapeHtml(r.unidade || '')}</td><td>${U.escapeHtml(r.departamento || '')}</td><td>${U.escapeHtml(r.gestor_direto || '')}</td><td><span class="badge ${r.situacao === 'Ativo' ? 'b2' : 'b4'}">${U.escapeHtml(r.situacao || '')}</span></td><td>${U.fmtDateBR(r.data_admissao)}</td></tr>`).join('')}</tbody></table></div>${d.lista.length > 300 ? `<p class="sub" style="margin-top:8px">Exibindo 300 de ${U.fmtInt(d.lista.length)}. Refine os filtros para ver outros.</p>` : ''}`, { full: true })}
      </div>`;
    const pu = d.porUnidade, pd = d.porDepartamento.slice(0, 12), ps = d.porSexo;
    barChart('c-col-unidade', pu.map(x => x.label), pu.map(x => x.value));
    barChart('c-col-depto', pd.map(x => x.label), pd.map(x => x.value), { horizontal: true });
    doughnutChart('c-col-sexo', ps.map(x => x.label), ps.map(x => x.value));
  }

  // ==================================================================
  // ROTATIVIDADE
  // ==================================================================
  function renderRotatividade(el, f) {
    if (noDataGate(el, ['colaboradores'], canUpload())) return;
    const d = M.rotatividadeMetrics(f);
    el.innerHTML = `
      <div class="kpi-grid">
        ${kpi('Turnover geral', U.fmtPct(d.taxaTurnoverGeral), `${U.fmtInt(d.totalAdmitidos)} admissão(ões), ${U.fmtInt(d.totalDesligados)} desligamento(s)`, 'var(--critical)')}
        ${kpi('Turnover geral na experiência', U.fmtPct(d.taxaTurnoverExperiencia), `${U.fmtInt(d.totalDesligadosExperiencia)} de ${U.fmtInt(d.totalAdmitidos)} admitido(s) saíram em até 3 meses`, '#eb6834')}
        ${kpi('Turnover voluntário', U.fmtPct(d.taxaVoluntaria), `${U.fmtInt(d.voluntarios)} caso(s)`, 'var(--warning)')}
        ${kpi('Turnover involuntário', U.fmtPct(d.taxaInvoluntaria), `${U.fmtInt(d.involuntarios)} caso(s)`, '#805AD5')}
        ${kpi('Taxa de desligamento geral', U.fmtPct(d.taxaDesligamentoGeral), 'do período filtrado', 'var(--p1)')}
        ${kpi('Turnover médio', U.fmtPct(d.turnoverMedio), 'média dos meses do período', '#1baf7a')}
        ${kpi('Taxa de desligamento média', U.fmtPct(d.taxaDesligamentoMedia), 'média dos meses do período', '#e87ba4')}
      </div>
      <div class="grid2">
        ${card('Desligamentos ao longo do tempo', '&#128200;', '<div class="chart-h tall"><canvas id="c-rot-serie"></canvas></div>', { full: true })}
        ${card('Voluntário vs. involuntário por mês', '&#9878;&#65039;', '<div class="chart-h"><canvas id="c-rot-tipo"></canvas></div>')}
        ${card('Motivos de desligamento', '&#128172;', d.motivos.length ? '<div class="chart-h"><canvas id="c-rot-motivos"></canvas></div>' : empty('Sem motivos informados.'))}
        ${card('Top 10 cargos com maior rotatividade', '&#128188;', d.cargosDesligados.length ? '<div class="chart-h"><canvas id="c-rot-cargos"></canvas></div>' : empty('Sem cargos informados.'))}
        ${card('Desligados no período', '&#128203;', d.listaDesligados.length ? `<div class="table-wrap"><table class="dt"><thead><tr><th>Nome</th><th>Cargo</th><th>Unidade</th><th>Departamento</th><th>Tipo</th><th>Data</th></tr></thead><tbody>${d.listaDesligados.map(r => `<tr><td>${U.escapeHtml(r.nome || '')}</td><td>${U.escapeHtml(r.cargo || '')}</td><td>${U.escapeHtml(r.unidade || '')}</td><td>${U.escapeHtml(r.departamento || '')}</td><td>${U.escapeHtml(r.tipo || '')}</td><td>${U.fmtDateBR(r.data)}</td></tr>`).join('')}</tbody></table></div>` : empty('Nenhum desligamento no período.'), { full: true })}
        ${card('Insights e plano de ação', '&#129504;', insightsList(d.insights) || empty('Sem dados suficientes para gerar insights.'), { full: true })}
      </div>`;
    lineChart('c-rot-serie', d.serie.map(x => x.label), [
      { label: 'Desligamentos', data: d.serie.map(x => x.desligamentos) },
      { label: 'Admissões', data: d.serie.map(x => x.admissoes) },
      { label: 'Taxa de desligamento (%)', data: d.serie.map(x => +(x.taxaDesligamento * 100).toFixed(2)) },
      { label: 'Turnover (%)', data: d.serie.map(x => +(x.taxaTurnover * 100).toFixed(2)) }
    ]);
    HUB_CHART('c-rot-tipo', {
      type: 'bar',
      data: {
        labels: d.serie.map(x => x.label),
        datasets: [
          { label: 'Voluntário', data: d.serie.map(x => x.voluntarios), backgroundColor: U.color(3), borderRadius: 4 },
          { label: 'Involuntário', data: d.serie.map(x => x.involuntarios), backgroundColor: U.color(6), borderRadius: 4 }
        ]
      },
      options: {
        plugins: {
          legend: { display: true },
          datalabels: { color: '#fff', font: { size: 9, weight: '700' }, formatter: v => v || '' }
        },
        scales: { x: { stacked: true }, y: { stacked: true } }
      }
    });
    if (d.motivos.length) {
      const top = d.motivos.slice(0, 8);
      barChart('c-rot-motivos', top.map(x => x.label), top.map(x => x.value), { horizontal: true });
    }
    if (d.cargosDesligados.length) {
      const topCargos = d.cargosDesligados.slice(0, 10);
      barChart('c-rot-cargos', topCargos.map(x => x.label), topCargos.map(x => x.value), { horizontal: true });
    }
  }

  // ==================================================================
  // ENTREVISTA DE DESLIGAMENTO
  // ==================================================================
  function splitMulti(v) {
    return v ? String(v).split(';').map(s => s.trim()).filter(Boolean) : [];
  }

  function renderNpsScale(np) {
    if (!np || !np.total) return '';
    const segs = [
      { key: 'detrator', label: 'Detratores (0-6)', pct: np.pctDetratores, n: np.detratores },
      { key: 'neutro', label: 'Neutros (7-8)', pct: np.pctNeutros, n: np.neutros },
      { key: 'promotor', label: 'Promotores (9-10)', pct: np.pctPromotores, n: np.promotores }
    ];
    return `<div class="nps-scale">` + segs.map(s =>
      `<div class="nps-seg ${s.key}" style="width:${Math.max(s.pct * 100, s.n ? 4 : 0)}%"><span class="n">${U.fmtPct(s.pct, 0)}</span><span class="lbl">${s.label} · ${U.fmtInt(s.n)}</span></div>`
    ).join('') + `</div>`;
  }

  function comentariosHtml(list, emptyMsg) {
    if (!list.length) return empty(emptyMsg || 'Sem comentários.');
    return list.slice(0, 20).map(c => `<div class="comment">${c.unidade || c.departamento ? `<div class="meta">${U.escapeHtml(c.unidade || '')}${c.unidade && c.departamento ? ' · ' : ''}${U.escapeHtml(c.departamento || '')}</div>` : ''}${U.escapeHtml(c.texto)}</div>`).join('');
  }

  // Cada índice vira um par de cards: o principal (pergunta fechada, sempre
  // visível) e um "Detalhamento" que só ganha conteúdo quando o usuário
  // clica numa barra do principal — mesma ideia do drill-down de Motivos ->
  // Submotivos, só que reaproveitada pros 10 índices com 2 (ou 3) níveis.
  function perguntaHtml(texto) {
    return texto ? `<p class="sub" style="margin-bottom:10px">${U.escapeHtml(texto)}</p>` : '';
  }

  function renderIndiceDesligamentoCard(idx, i) {
    const mainBody = perguntaHtml(idx.pergunta) + (idx.principal.length ? `<div class="chart-h"><canvas id="c-desl-idx-${i}"></canvas></div>` : empty('Sem dados.'));
    if (idx.simples) return card(idx.titulo, '&#128202;', mainBody, { full: true });
    const secBody = `<p class="sub" style="margin-bottom:8px">Clique numa opção do gráfico ao lado para detalhar.</p><div id="desl-idx-sec-${i}">${empty('Selecione uma opção ao lado.')}</div>`;
    return card(idx.titulo, '&#128202;', mainBody) + card('Detalhamento', '&#128269;', secBody);
  }

  function wireIndiceDesligamento(idx, i) {
    if (!idx.principal.length) return;
    const t = idx.principal;
    barChart(`c-desl-idx-${i}`, t.map(x => x.label), t.map(x => x.value), {
      horizontal: true,
      onClick: idx.simples ? undefined : (label => renderIndiceSecundaria(idx, i, label))
    });
  }

  function renderIndiceSecundaria(idx, i, respostaPrincipal) {
    const container = document.getElementById(`desl-idx-sec-${i}`);
    if (!container) return;
    const linhasResp = idx.linhas.filter(l => l.principal === respostaPrincipal);
    const bucket = linhasResp.length ? linhasResp[0].bucket : null;
    const multi = bucket === 'negativo' && idx.negativaMulti;
    const counts = M.countAnswers(linhasResp.map(l => l.secundaria), { multi });
    const secCanvas = `c-desl-idx-${i}-sec`;
    const terId = `desl-idx-ter-${i}`;
    const temTerciaria = bucket === 'negativo' && idx.temTerciaria;
    const perguntaSec = bucket === 'positivo' ? idx.perguntaPositiva : idx.perguntaNegativa;
    container.innerHTML = `<p class="sub" style="margin-bottom:2px"><strong>${U.escapeHtml(respostaPrincipal)}</strong> — ${U.fmtInt(linhasResp.length)} resposta(s)</p>` +
      perguntaHtml(perguntaSec) +
      (counts.length ? `<div class="chart-h short"><canvas id="${secCanvas}"></canvas></div>` : empty('Sem detalhamento disponível para esta opção.')) +
      (temTerciaria ? `<div id="${terId}" style="margin-top:14px"></div>` : '');
    if (!counts.length) return;
    barChart(secCanvas, counts.map(x => x.label), counts.map(x => x.value), {
      horizontal: true,
      onClick: temTerciaria ? (label2 => renderIndiceTerciaria(idx, terId, linhasResp, label2, multi)) : undefined
    });
  }

  function renderIndiceTerciaria(idx, terId, linhasResp, label2, multi) {
    const terEl = document.getElementById(terId);
    if (!terEl) return;
    if (idx.outrosGatilho && label2 !== idx.outrosGatilho) { terEl.innerHTML = ''; return; }
    const sub = linhasResp.filter(l => multi ? splitMulti(l.secundaria).includes(label2) : l.secundaria === label2);
    const comentarios = sub.map(l => ({ unidade: l.unidade, departamento: l.departamento, texto: l.terciaria })).filter(c => c.texto);
    terEl.innerHTML = `<p class="sub" style="margin-bottom:8px"><strong>Comentários adicionais</strong> — ${U.fmtInt(comentarios.length)}</p>` + comentariosHtml(comentarios, 'Sem comentários adicionais para esta opção.');
  }

  function renderDesligamento(el, f) {
    // O card "Gerar link de entrevista" (HUB_ENTREVISTA_DESLIGAMENTO) fica
    // independente do noDataGate abaixo — ele não depende de planilha
    // nenhuma ter sido importada, é uma tela operacional (grava direto em
    // entrevistas_desligamento), diferente do resto desta página (dashboard
    // alimentado só por upload de entrevista_pesquisa/entrevista_solicitacao).
    const cardLink = HUB_ENTREVISTA_DESLIGAMENTO ? HUB_ENTREVISTA_DESLIGAMENTO.renderCardGerarLink() : '';
    if (noDataGate(el, ['entrevista_pesquisa', 'entrevista_solicitacao'], canUpload())) {
      if (cardLink) el.innerHTML = cardLink + el.innerHTML;
      HUB_ENTREVISTA_DESLIGAMENTO && HUB_ENTREVISTA_DESLIGAMENTO.wireCardGerarLink(el);
      return;
    }
    const d = M.entrevistaMetrics(f);
    // Drivers de Atração (simples) abre a sequência; Motivos/Submotivos
    // entram logo em seguida como um par, antes dos demais índices — o
    // resto segue a ordem normal, cada um como um par índice+detalhamento.
    const [primeiroIndice, ...demaisIndices] = d.indicesDesligamento;
    const motivosSubmotivosPair =
      card('Motivos de desligamento', '&#128172;', d.motivos.length ? '<div class="chart-h"><canvas id="c-desl-motivos"></canvas></div>' : empty('Sem dados.')) +
      card('Submotivos', '&#128269;', '<p class="sub" style="margin-bottom:8px">Clique numa barra de "Motivos de desligamento" para detalhar.</p><div id="submotivos-body">' + empty('Selecione um motivo ao lado.') + '</div>');
    el.innerHTML = `
      ${cardLink}
      <div class="kpi-grid">
        ${kpi('Respostas de pesquisa', U.fmtInt(d.totalRespostas), '', 'var(--p1)')}
        ${kpi('Trabalhariam novamente', d.totalRespostas ? U.fmtPct(d.positivos / d.totalRespostas) : '—', `${U.fmtInt(d.positivos)} de ${U.fmtInt(d.totalRespostas)}`, '#1baf7a')}
        ${kpi('eNPS', d.nps === null ? '—' : d.nps, '', 'var(--p2)')}
        ${kpi('Solicitações de desligamento', U.fmtInt(d.totalSolicitacoes), '', 'var(--warning)')}
      </div>
      ${renderNpsScale(d.npsDetalhe)}
      <div class="grid2-fixed">
        ${renderIndiceDesligamentoCard(primeiroIndice, 0)}
        ${motivosSubmotivosPair}
        ${demaisIndices.map((idx, i) => renderIndiceDesligamentoCard(idx, i + 1)).join('')}
      </div>
      <div class="grid2">
        ${card('Status da entrevista', '&#9989;', d.statusEntrevista.length ? '<div class="chart-h short"><canvas id="c-desl-status"></canvas></div>' : empty('Sem dados.'))}
        ${card('Comentários positivos (anônimos)', '&#128172;', `<div class="scroll-box">${comentariosHtml(d.comentariosPositivos)}</div>`)}
        ${card('Comentários negativos (anônimos)', '&#128172;', `<div class="scroll-box">${comentariosHtml(d.comentariosNegativos)}</div>`)}
        ${card('Pessoas citadas nos depoimentos', '&#128100;', d.pessoasCitadas.length ? `<div class="scroll-box">${topRows(d.pessoasCitadas.map(p => ({ label: p.nome, value: p.count })), 'Menções')}</div>` : empty('Nenhuma pessoa identificada nos textos.'))}
        ${card('Insights e plano de ação', '&#129504;', insightsList(d.insights), { full: true })}
      </div>`;
    d.indicesDesligamento.forEach((idx, i) => wireIndiceDesligamento(idx, i));
    if (d.motivos.length) {
      const t = d.motivos.slice(0, 8);
      barChart('c-desl-motivos', t.map(x => x.label), t.map(x => x.value), {
        horizontal: true,
        onClick: motivo => renderSubmotivos(motivo, d.motivoSubmotivoPairs)
      });
    }
    if (d.statusEntrevista.length) doughnutChart('c-desl-status', d.statusEntrevista.map(x => x.label), d.statusEntrevista.map(x => x.value));
    HUB_ENTREVISTA_DESLIGAMENTO && HUB_ENTREVISTA_DESLIGAMENTO.wireCardGerarLink(el);
  }

  function renderSubmotivos(motivo, pairs) {
    const body = document.getElementById('submotivos-body');
    if (!body) return;
    const sub = pairs.filter(p => p.motivo === motivo);
    const counts = M.countBy(sub, 'submotivo');
    body.innerHTML = `<p class="sub" style="margin-bottom:8px"><strong>${U.escapeHtml(motivo)}</strong> — ${U.fmtInt(sub.length)} caso(s)</p>` +
      (counts.length ? '<div class="chart-h short"><canvas id="c-desl-submotivos"></canvas></div>' : empty('Sem submotivo informado para este motivo.'));
    if (counts.length) barChart('c-desl-submotivos', counts.map(x => x.label), counts.map(x => x.value), { horizontal: true });
  }

  // ==================================================================
  // CELEBRAÇÕES
  // ==================================================================
  function renderCelebracoes(el, f) {
    if (noDataGate(el, ['celebracoes'], canUpload())) return;
    const d = M.celebracoesMetrics(f);
    el.innerHTML = `
      <div class="kpi-grid">
        ${kpi('Celebrações enviadas', U.fmtInt(d.total), '', '#e87ba4')}
        ${kpi('Curtidas', U.fmtInt(d.curtidas), '', 'var(--p1)')}
        ${kpi('Comentários', U.fmtInt(d.comentarios), '', 'var(--p2)')}
      </div>
      <div class="grid2">
        ${card('Por departamento', '&#128194;', d.porDepartamento.length ? '<div class="chart-h"><canvas id="c-cel-depto"></canvas></div>' : empty('Sem dados.'))}
        ${card('Evolução mensal', '&#128200;', d.serie.length ? '<div class="chart-h"><canvas id="c-cel-serie"></canvas></div>' : empty('Sem dados.'))}
        ${card('Gestores que mais enviaram', '&#127942;', topRows(d.porGestor, 'Enviadas'))}
        ${card('Top remetentes', '&#128101;', topRows(d.porRemetente, 'Enviadas'))}
      </div>`;
    if (d.porDepartamento.length) { const t = d.porDepartamento.slice(0, 12); barChart('c-cel-depto', t.map(x => x.label), t.map(x => x.value), { horizontal: true }); }
    if (d.serie.length) lineChart('c-cel-serie', d.serie.map(x => x.label), [{ label: 'Celebrações', data: d.serie.map(x => x.value) }]);
  }

  // ==================================================================
  // FEEDBACKS
  // ==================================================================
  function renderFeedbacks(el, f) {
    if (noDataGate(el, ['feedbacks'], canUpload())) return;
    const d = M.feedbacksMetrics(f);
    el.innerHTML = `
      <div class="kpi-grid">${kpi('Feedbacks enviados', U.fmtInt(d.total), '', '#1baf7a')}</div>
      <div class="grid2">
        ${card('Por departamento', '&#128194;', d.porDepartamento.length ? '<div class="chart-h"><canvas id="c-fb-depto"></canvas></div>' : empty('Sem dados.'))}
        ${card('Evolução mensal', '&#128200;', d.serie.length ? '<div class="chart-h"><canvas id="c-fb-serie"></canvas></div>' : empty('Sem dados.'))}
        ${card('Quem mais enviou (gestor/remetente)', '&#127942;', topRows(d.porGestor, 'Enviados'))}
        ${card('Quem mais recebeu', '&#128101;', topRows(d.porDestinatario, 'Recebidos'))}
      </div>`;
    if (d.porDepartamento.length) { const t = d.porDepartamento.slice(0, 12); barChart('c-fb-depto', t.map(x => x.label), t.map(x => x.value), { horizontal: true }); }
    if (d.serie.length) lineChart('c-fb-serie', d.serie.map(x => x.label), [{ label: 'Feedbacks', data: d.serie.map(x => x.value) }]);
  }

  // ==================================================================
  // 1:1
  // ==================================================================
  function renderOneOnOne(el, f) {
    if (noDataGate(el, ['one_on_one'], canUpload())) return;
    const d = M.oneOnOneMetrics(f);
    el.innerHTML = `
      <div class="kpi-grid">
        ${kpi('1:1 registrados', U.fmtInt(d.total), '', '#4a3aa7')}
        ${kpi('Realizados', U.fmtInt(d.realizados), d.total ? U.fmtPct(d.realizados / d.total) : '', '#1baf7a')}
        ${kpi('Agendados', U.fmtInt(d.agendados), '', 'var(--warning)')}
      </div>
      <div class="grid2">
        ${card('Realizados por departamento', '&#128194;', d.porDepartamento.length ? '<div class="chart-h"><canvas id="c-oo-depto"></canvas></div>' : empty('Sem dados.'))}
        ${card('Evolução mensal', '&#128200;', d.serie.length ? '<div class="chart-h"><canvas id="c-oo-serie"></canvas></div>' : empty('Sem dados.'))}
        ${card('Gestores que mais realizaram 1:1', '&#127942;', topRows(d.porGestor, 'Realizados'), { full: true })}
      </div>`;
    if (d.porDepartamento.length) { const t = d.porDepartamento.slice(0, 12); barChart('c-oo-depto', t.map(x => x.label), t.map(x => x.value), { horizontal: true }); }
    if (d.serie.length) lineChart('c-oo-serie', d.serie.map(x => x.label), [{ label: '1:1 realizados', data: d.serie.map(x => x.value) }]);
  }

  // ==================================================================
  // TREINAMENTOS
  // ==================================================================
  function renderTreinamentos(el, f) {
    if (noDataGate(el, ['twygo_participantes'], canUpload())) return;
    const d = M.treinamentosMetrics(f);
    let drill = '';
    if (f.colaborador && d.porColaborador && d.porColaborador.totalCursos !== undefined) {
      const p = d.porColaborador;
      drill = card(`Detalhe de treinamentos — ${U.escapeHtml(f.colaborador)}`, '&#127891;', `
        <div class="kpi-grid" style="margin-bottom:16px">
          ${kpi('Progresso geral', p.progressoGeral == null ? '—' : U.fmtPct(p.progressoGeral), '', 'var(--p1)')}
          ${kpi('Pontuação', p.pontuacao == null ? '—' : U.fmtInt(p.pontuacao), '', '#eda100')}
          ${kpi('Horas de treinamento', U.fmt1(p.horasTotais), '', '#1baf7a')}
          ${kpi('Cursos concluídos', `${p.cursosConcluidos}/${p.totalCursos}`, '', '#4a3aa7')}
        </div>
        <div class="table-wrap"><table class="dt"><thead><tr><th>Curso</th><th>Situação</th><th>Progresso</th><th>Nota</th><th>Carga horária</th><th>Último acesso</th></tr></thead><tbody>
          ${p.cursos.map(c => `<tr><td>${U.escapeHtml(c.curso || '')}</td><td>${U.escapeHtml(c.situacao || '')}</td><td>${c.progresso == null ? '—' : U.fmtPct(c.progresso)}</td><td>${c.nota == null ? '—' : U.fmt1(c.nota)}</td><td>${c.cargaHoraria == null ? '—' : U.fmt1(c.cargaHoraria) + 'h'}</td><td>${U.fmtDateBR(c.ultimoAcesso)}</td></tr>`).join('') || '<tr><td colspan="6">Nenhum curso encontrado para esta pessoa.</td></tr>'}
        </tbody></table></div>`, { full: true });
    }
    el.innerHTML = `
      <div class="kpi-grid">
        ${kpi('Inscrições confirmadas', U.fmtInt(d.totalInscricoes), 'cancelamentos não entram na conta', 'var(--p1)')}
        ${kpi('Taxa de conclusão', U.fmtPct(d.taxaConclusao), `${U.fmtInt(d.totalConcluidos)} concluída(s)`, '#1baf7a')}
        ${kpi('Progresso médio', U.fmtPct(d.progressoMedio), '', 'var(--p2)')}
        ${kpi('Horas de treinamento (soma)', U.fmt1(d.horasTotais), '', '#eda100')}
        ${kpi('Pontuação média', U.fmt1(d.pontuacaoMedia), `${U.fmtInt(d.totalUsuarios)} usuário(s)`, '#4a3aa7')}
        ${kpi('Cursos concluídos', U.fmtInt(d.totalConcluidos), '', '#1baf7a')}
        ${kpi('Cursos em andamento', U.fmtInt(d.totalEmAndamento), '', '#eda100')}
        ${kpi('Cursos não iniciados', U.fmtInt(d.totalNaoIniciados), '0% de progresso', 'var(--critical)')}
      </div>
      ${drill}
      <div class="grid2">
        ${card('Progresso por curso', '&#128218;', d.progressoPorCurso.length ? `<div class="chart-scroll"><div class="chart-inner" id="c-tr-cursos-wrap"><canvas id="c-tr-cursos"></canvas></div></div>` : empty('Sem dados.'), { full: true })}
        ${card('Evolução de inscrições', '&#128200;', d.serie.length ? '<div class="chart-h"><canvas id="c-tr-serie"></canvas></div>' : empty('Sem dados.'))}
        ${card('Top 10 departamentos — conclusão e progresso', '&#127942;', rankingTable(d.topDepartamentos, 'Departamento'))}
        ${card('Top 10 colaboradores — conclusão e progresso', '&#127942;', rankingTable(d.topColaboradores, 'Colaborador'))}
      </div>`;
    if (d.progressoPorCurso.length) {
      // Altura do canvas cresce com a quantidade de cursos (não com o tamanho
      // do card) — o card fica com altura fixa e rola por dentro, assim dá
      // pra ver a lista inteira sem cada barra ficar espremida.
      document.getElementById('c-tr-cursos-wrap').style.height = Math.max(d.progressoPorCurso.length * 32, 200) + 'px';
      barChart('c-tr-cursos', d.progressoPorCurso.map(x => x.label), d.progressoPorCurso.map(x => x.value), { horizontal: true, pct: true });
    }
    if (d.serie.length) lineChart('c-tr-serie', d.serie.map(x => x.label), [{ label: 'Inscrições', data: d.serie.map(x => x.value) }]);
  }

  window.HUB_SECTIONS = {
    renderDashboard, renderHeadcount, renderRotatividade, renderDesligamento,
    renderCelebracoes, renderFeedbacks, renderOneOnOne, renderTreinamentos
  };
})();
