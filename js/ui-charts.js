// Componentes visuais compartilhados por TODAS as telas de indicadores do
// hub — tanto o módulo Indicadores (metrics-indicadores.js) quanto o
// indicador ao vivo de Recrutamento (metrics-recrutamento.js) montam seus
// cards/gráficos com as mesmas funções daqui, pra manter uma identidade
// visual única em vez de dois estilos diferentes dentro do mesmo hub.
(function () {
  const U = HUB_UTILS;
  const CHARTS = {};
  if (window.ChartDataLabels) Chart.register(ChartDataLabels);

  function chart(canvasId, config) {
    const el = document.getElementById(canvasId);
    if (!el) return null;
    if (CHARTS[canvasId]) { CHARTS[canvasId].destroy(); delete CHARTS[canvasId]; }
    config.options = config.options || {};
    config.options.maintainAspectRatio = false;
    const c = new Chart(el.getContext('2d'), config);
    CHARTS[canvasId] = c;
    return c;
  }
  window.HUB_CHART = chart;

  function kpi(label, value, sub, colorVar) {
    return `<div class="kpi" style="--bar:${colorVar || 'var(--p1)'}">
      <div class="lbl">${label}</div><div class="val">${value}</div>
      ${sub ? `<div class="sub">${sub}</div>` : ''}
    </div>`;
  }

  function empty(msg, sub) {
    return `<div class="empty"><span class="ic">&#128203;</span><p>${msg}</p>${sub ? `<p class="sub">${sub}</p>` : ''}</div>`;
  }

  function card(title, icon, bodyHtml, opts) {
    opts = opts || {};
    return `<div class="card${opts.full ? ' full' : ''}"><h3><span>${icon || ''}</span>${title}</h3>${bodyHtml}</div>`;
  }

  function insightsList(insights) {
    const icons = { alerta: '&#9888;&#65039;', acao: '&#128161;', info: '&#8505;&#65039;' };
    if (!insights || !insights.length) return '';
    return insights.map(i => `<div class="insight ${i.tipo}"><span class="ic">${icons[i.tipo] || icons.info}</span><span>${U.escapeHtml(i.texto)}</span></div>`).join('');
  }

  // needed: nomes de tabelas (em `source`, padrão window.HUB_DATA) que
  // precisam ter pelo menos 1 linha pra essa tela fazer sentido. canManage:
  // se o usuário pode importar/gerar esses dados (controla a dica exibida no
  // estado vazio). source: de onde ler os dados — o indicador ao vivo de
  // Recrutamento passa HUB_RECRUIT_DATA aqui, já que suas tabelas
  // (vagas/candidatos/entrevistas) não vivem em HUB_DATA.
  function noDataGate(el, needed, canManage, manageHint, source) {
    const data = source || window.HUB_DATA || {};
    const any = Object.values(data).some(arr => arr && arr.length);
    if (!any) {
      el.innerHTML = empty('Nenhum dado carregado ainda.', canManage ? (manageHint || 'Vá em Administração para importar os dados.') : 'Peça para um administrador importar os dados.');
      return true;
    }
    if (needed && !needed.some(t => (data[t] || []).length)) {
      el.innerHTML = empty('Sem dados para esta tela ainda.', canManage ? (manageHint || 'Importe os dados correspondentes em Administração.') : 'Peça para um administrador importar os dados correspondentes.');
      return true;
    }
    return false;
  }

  const DL_COLOR = '#16181D';

  function barChart(id, labels, values, opts) {
    opts = opts || {};
    const cfg = {
      type: 'bar',
      data: { labels, datasets: [{ data: values, backgroundColor: labels.map((_, i) => opts.singleColor || U.color(i)), borderRadius: 5, maxBarThickness: 34 }] },
      options: {
        indexAxis: opts.horizontal ? 'y' : 'x',
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true },
          datalabels: {
            color: DL_COLOR, font: { size: 10, weight: '700' },
            anchor: 'end', align: opts.horizontal ? 'end' : 'top',
            formatter: opts.pct ? v => U.fmtPct(v, 0) : v => U.fmtInt(v)
          }
        },
        // Nunca passar `ticks: undefined` explicitamente — o Chart.js não
        // ignora essa chave como ignora `max: undefined`, e isso apaga o
        // callback padrão que faz o eixo de categoria mostrar o texto do
        // rótulo em vez do índice numérico da barra.
        scales: {
          x: Object.assign({ grid: { display: opts.horizontal } }, opts.pct && opts.horizontal ? { max: 1, ticks: { callback: v => U.fmtPct(v, 0) } } : {}),
          y: Object.assign({ grid: { display: !opts.horizontal } }, opts.pct && !opts.horizontal ? { max: 1, ticks: { callback: v => U.fmtPct(v, 0) } } : {})
        }
      }
    };
    // Com eixo em % o max fica travado em 1 (100%) sem folga nenhuma — uma
    // barra em 100% empurra o rótulo "100%" pra fora da área do gráfico e o
    // canvas corta o texto (ex.: "100%" aparece cortado como "10"). Reserva
    // um respiro no lado em que o rótulo estica pra fora da barra.
    if (opts.pct) cfg.options.layout = { padding: opts.horizontal ? { right: 40 } : { top: 22 } };
    if (opts.onClick) {
      cfg.options.onClick = (evt, els) => { if (els.length) opts.onClick(labels[els[0].index]); };
      cfg.options.onHover = (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; };
    }
    return HUB_CHART(id, cfg);
  }

  function lineChart(id, labels, series) {
    HUB_CHART(id, {
      type: 'line',
      data: { labels, datasets: series.map((s, i) => ({ label: s.label, data: s.data, borderColor: U.color(i), backgroundColor: U.color(i) + '33', tension: .3, fill: series.length === 1, pointRadius: 3 })) },
      options: {
        plugins: {
          legend: { display: series.length > 1 },
          datalabels: {
            color: DL_COLOR, font: { size: 9, weight: '700' }, align: 'top', offset: 4,
            formatter: v => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
          }
        }
      }
    });
  }

  function doughnutChart(id, labels, values) {
    const total = values.reduce((s, v) => s + v, 0) || 1;
    HUB_CHART(id, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: labels.map((_, i) => U.color(i)) }] },
      options: {
        plugins: {
          legend: { display: true, position: 'right', labels: { boxWidth: 11, font: { size: 11 } } },
          datalabels: {
            color: '#fff', font: { size: 10, weight: '700' },
            formatter: v => v ? U.fmtPct(v / total, 0) : ''
          }
        }
      }
    });
  }

  function topRows(list, valueLabel) {
    if (!list.length) return empty('Sem registros.');
    return `<div class="table-wrap"><table class="dt"><thead><tr><th>Nome</th><th>${valueLabel}</th></tr></thead><tbody>` +
      list.slice(0, 15).map(r => `<tr><td>${U.escapeHtml(r.label)}</td><td>${U.fmtInt(r.value)}</td></tr>`).join('') +
      '</tbody></table></div>';
  }

  function rankingTable(list, firstColLabel) {
    if (!list.length) return empty('Sem registros.');
    // Quando os itens trazem cargo/departamento (Top 10 colaboradores), essas
    // colunas extras entram entre o nome e as métricas de conclusão.
    const temContexto = list.some(r => r.cargo || r.departamento);
    const colunasExtra = temContexto ? '<th>Cargo</th><th>Departamento</th>' : '';
    return `<div class="table-wrap"><table class="dt"><thead><tr><th>${firstColLabel}</th>${colunasExtra}<th>Taxa de conclusão</th><th>Progresso médio</th><th>Inscrições</th></tr></thead><tbody>` +
      list.map(r => `<tr><td>${U.escapeHtml(r.label)}</td>${temContexto ? `<td>${U.escapeHtml(r.cargo || '')}</td><td>${U.escapeHtml(r.departamento || '')}</td>` : ''}<td>${U.fmtPct(r.taxaConclusao)}</td><td>${U.fmtPct(r.progressoMedio)}</td><td>${U.fmtInt(r.total)}</td></tr>`).join('') +
      '</tbody></table></div>';
  }

  window.HUB_UI = { kpi, empty, card, insightsList, noDataGate, barChart, lineChart, doughnutChart, topRows, rankingTable };
})();
