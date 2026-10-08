// Indicadores → Fechamento do Período: a apresentação do RH à diretoria,
// montada com os dados do Hub no layout do deck oficial. Só Administrador
// (indicadores.fechamento). Os slides vêm de fechamento-slides.js e são
// desenhados aqui em HTML (960 × 540 pt, escalados para caber na tela); o
// mesmo conteúdo vai para o PowerPoint por fechamento-pptx.js.
//
// Fase 1: Recrutamento e Seleção, a partir da planilha 18 (card 18 do Upload).
(function () {
  const S = () => window.HUB_FECHAMENTO_SLIDES;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PT = 4 / 3;   // 1 pt = 1,333 px
  const FUNDOS = { capa: 'assets/fechamento/fundo-capa.jpg', divisor: 'assets/fechamento/fundo-divisor.jpg', conteudo: 'assets/fechamento/fundo-conteudo.jpg' };
  const ROTULO_TIPO = { mensal: 'Mensal', bimestral: 'Bimestral', semestral: 'Semestral', anual: 'Anual' };

  const state = { tipo: 'mensal', ano: null, n: null };
  let slidesAtuais = [];
  let elAtual = null;

  const STYLE = `<style>
    #sec-ind-fechamento .fx-top{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:16px}
    #sec-ind-fechamento .fx-top label{display:flex;flex-direction:column;gap:4px;font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}
    #sec-ind-fechamento .fx-top select{padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;font-family:inherit;color:var(--text);background:#fff;min-width:150px}
    #sec-ind-fechamento .fx-acoes{display:flex;gap:8px;margin-left:auto;flex-wrap:wrap}
    #sec-ind-fechamento .fx-btn{display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border-radius:9px;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;border:1.5px solid var(--p1);background:#fff;color:var(--p1)}
    #sec-ind-fechamento .fx-btn.pri{background:var(--p1);color:#fff}
    #sec-ind-fechamento .fx-btn:disabled{opacity:.55;cursor:wait}
    #sec-ind-fechamento .fx-btn svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2}
    #sec-ind-fechamento .fx-info{font-size:11.5px;color:var(--muted);margin:-6px 0 14px;line-height:1.5}
    #sec-ind-fechamento .fx-lista{display:flex;flex-direction:column;gap:22px;max-width:1100px}
    #sec-ind-fechamento .fx-cab{display:flex;justify-content:space-between;align-items:baseline;font-size:12px;color:var(--text2);margin-bottom:6px}
    #sec-ind-fechamento .fx-cab b{color:var(--text)}
    #sec-ind-fechamento .fx-notas{font-size:11.5px;color:var(--muted);margin-top:6px}
    #sec-ind-fechamento .fx-notas summary{cursor:pointer}
    #sec-ind-fechamento .fx-notas p{white-space:pre-wrap;margin:6px 0 0;line-height:1.5}
    .fx-quadro{position:relative;overflow:hidden;border-radius:8px;box-shadow:0 2px 10px rgba(10,25,66,.18);background:#1E3461}
    .fx-slide{position:absolute;left:0;top:0;width:960pt;height:540pt;transform-origin:0 0;background-size:cover;background-position:center;font-family:'Ubuntu',system-ui,sans-serif;overflow:hidden}
    .fx-el{position:absolute;box-sizing:border-box}
    .fx-txt{display:flex;flex-direction:column;line-height:1.2;overflow:visible}
    .fx-txt p{margin:0}
    .fx-txt p.bul{position:relative;padding-left:12pt}
    .fx-txt p.bul::before{content:'•';position:absolute;left:2pt}
    .fx-chart canvas{width:100%!important;height:100%!important}
    .fx-palco{position:fixed;inset:0;background:#000;z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer}
    .fx-palco .fx-quadro{border-radius:0;box-shadow:none}
    .fx-palco .fx-pg{position:fixed;right:18px;bottom:12px;color:rgba(255,255,255,.45);font:12px 'Ubuntu',sans-serif}
  </style>`;

  const ICON = {
    baixar: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>',
    apresentar: '<svg viewBox="0 0 24 24"><path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/></svg>'
  };

  // ------------------------------------------------------------------
  // Desenho de um slide (mesma descrição que vai para o PPTX)
  // ------------------------------------------------------------------
  const hex = (c, transp) => {
    const n = parseInt(c, 16), a = transp == null ? 1 : 1 - transp / 100;
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const box = e => `left:${e.x}pt;top:${e.y}pt;width:${e.w}pt;height:${e.h}pt;`;

  function htmlTexto(e) {
    const just = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[e.valign || 'top'];
    const ps = e.paras.map(p => {
      const st = `text-align:${p.align || e.align || 'left'};` + (p.spaceAfter ? `margin-bottom:${p.spaceAfter}pt;` : '') + (p.spaceBefore ? `margin-top:${p.spaceBefore}pt;` : '');
      const rs = p.runs.map(r => {
        const bold = r.bold != null ? r.bold : !!e.bold;
        return `<span style="font-weight:${bold ? 700 : 400};${r.italic ? 'font-style:italic;' : ''}color:#${r.color || e.color};font-size:${r.size || e.size}pt">${esc(r.text)}</span>`;
      }).join('');
      return `<p class="${p.bullet ? 'bul' : ''}" style="${st}color:#${e.color};font-size:${e.size}pt">${rs || '&nbsp;'}</p>`;
    }).join('');
    return `<div class="fx-el fx-txt" style="${box(e)}justify-content:${just};font-size:${e.size}pt;color:#${e.color}">${ps}</div>`;
  }

  function htmlSlide(sd, prefixo) {
    let i = 0;
    const els = sd.els.map(e => {
      if (e.t === 'rect') return `<div class="fx-el" style="${box(e)}background:${hex(e.fill, e.transp)};${e.line ? `border:.75pt solid #${e.line};` : ''}${e.r ? `border-radius:${e.r}pt;` : ''}"></div>`;
      if (e.t === 'text') return htmlTexto(e);
      if (e.t === 'chart') return `<div class="fx-el fx-chart" style="${box(e)}"><canvas id="${prefixo}-c${i++}"></canvas></div>`;
      return '';
    }).join('');
    return `<div class="fx-slide" style="background-image:url('${FUNDOS[sd.fundo]}')">${els}</div>`;
  }

  function fmtValor(v, pct) {
    if (v == null) return '';
    if (pct) return (v * 100).toFixed(1).replace('.', ',') + '%';
    return v === 0 ? '' : Math.round(v).toLocaleString('pt-BR');
  }

  function configGrafico(e, C) {
    const px = pt => Math.round(pt * PT);
    const fonte = (pt, bold) => ({ family: 'Ubuntu', size: px(pt), weight: bold ? '700' : '400' });
    const claro = '#' + C.claro;
    const horizontal = e.kind === 'bar';
    const datasets = e.series.map(s => s.line
      ? { type: 'line', label: s.name, data: s.values, borderColor: '#' + s.color, backgroundColor: '#' + s.color, borderWidth: 2, pointRadius: 3, spanGaps: false, order: 0,
        datalabels: { anchor: 'end', align: 'top', color: '#FFD9B3', font: fonte(8, true), formatter: v => fmtValor(v, e.pct) } }
      : { type: 'bar', label: s.name, data: s.values, backgroundColor: '#' + s.color, borderWidth: 0, categoryPercentage: horizontal ? 0.7 : 0.75, barPercentage: 0.9, order: 1,
        datalabels: e.kind === 'combo'
          ? { anchor: 'start', align: 'end', color: '#FFFFFF', font: fonte(8, true), formatter: v => fmtValor(v, e.pct) }
          : { anchor: 'end', align: 'end', color: '#FFFFFF', font: fonte(9, true), formatter: v => fmtValor(v, e.pct) } });
    const eixoCat = { ticks: { color: claro, font: fonte(9) }, grid: { display: false }, border: { color: '#5C76A8' } };
    const eixoVal = { display: false, beginAtZero: true, grace: horizontal ? '28%' : '15%', grid: { display: false } };
    return {
      type: 'bar',
      data: { labels: e.labels, datasets },
      options: {
        indexAxis: horizontal ? 'y' : 'x', animation: false, responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 4, right: horizontal ? 8 : 4 } },
        scales: horizontal ? { y: eixoCat, x: eixoVal } : { x: eixoCat, y: eixoVal },
        plugins: {
          title: { display: !!e.title, text: e.title, color: '#FFFFFF', font: fonte(11, true), padding: { bottom: 6 } },
          legend: { display: !!e.legend && e.series.length > 1, position: 'top', labels: { color: claro, font: fonte(9), boxWidth: px(7), boxHeight: px(7) } },
          tooltip: { enabled: true },
          datalabels: { display: true, clamp: true }
        }
      }
    };
  }

  function desenharGraficos(sd, prefixo) {
    const C = S().COR;
    let i = 0;
    sd.els.filter(e => e.t === 'chart').forEach(e => {
      const id = `${prefixo}-c${i++}`;
      if (!e.labels.length) {
        const cv = document.getElementById(id);
        if (cv) cv.parentNode.innerHTML = `<div style="height:100%;display:flex;flex-direction:column;align-items:center;color:#${C.branco};font:700 11pt Ubuntu"><span>${esc(e.title || '')}</span><span style="margin:auto;font-weight:400;color:#${C.suave}">Sem dados no período</span></div>`;
        return;
      }
      HUB_CHART(id, configGrafico(e, C));
    });
  }

  function encaixar(quadro, largura) {
    const k = largura / (960 * PT);
    quadro.style.width = largura + 'px';
    quadro.style.height = Math.round(540 * PT * k) + 'px';
    quadro.querySelector('.fx-slide').style.transform = `scale(${k})`;
  }

  // ------------------------------------------------------------------
  // Período
  // ------------------------------------------------------------------
  function anosDisponiveis(vagas) {
    const anos = new Set();
    vagas.forEach(v => { if (v.data_abertura) anos.add(+v.data_abertura.slice(0, 4)); });
    return Array.from(anos).filter(a => a >= 2024).sort((a, b) => b - a);
  }

  // Último período completo antes de hoje.
  function periodoPadrao(tipo) {
    const hoje = new Date();
    let ano = hoje.getFullYear();
    const ultimoMesFechado = hoje.getMonth();   // 0 = janeiro → nenhum mês fechado no ano
    const meses = S().TIPOS[tipo].meses;
    let n = Math.floor(ultimoMesFechado / meses);
    if (n < 1) { ano -= 1; n = S().TIPOS[tipo].qtd; }
    return { ano, n };
  }

  function opcoesPeriodo(tipo) {
    const t = S().TIPOS[tipo];
    const out = [];
    for (let n = 1; n <= t.qtd; n++) {
      const p = S().periodo(tipo, 2000, n);
      out.push({ n, nome: tipo === 'mensal' ? S().MESES[n - 1] : tipo === 'anual' ? 'Ano inteiro' : p.label.replace(' 2000', '') });
    }
    return out;
  }

  // ------------------------------------------------------------------
  // Tela
  // ------------------------------------------------------------------
  async function renderFechamento(el) {
    elAtual = el;
    el.innerHTML = STYLE + '<div class="card"><div class="empty">Carregando o Fechamento...</div></div>';
    try {
      await HUB_FECHAMENTO.carregar();
    } catch (err) {
      el.innerHTML = STYLE + `<div class="card"><div class="empty">${esc(err.message)}</div></div>`;
      return;
    }
    const d = window.HUB_FECHAMENTO_DATA;
    if (!d.vagas.length) {
      el.innerHTML = STYLE + '<div class="card"><div class="empty">Nenhuma vaga na base do Fechamento. Suba a planilha 18. Controle Geral de Vagas em Administração → Upload de Planilhas.</div></div>';
      return;
    }
    if (state.ano == null) Object.assign(state, periodoPadrao(state.tipo));
    desenhar(el);
    // Já baixa o gerador de PowerPoint em segundo plano (é o que mais demora no
    // primeiro "Baixar PPTX").
    HUB_FECHAMENTO_PPTX.carregarBiblioteca().catch(() => {});
  }

  function desenhar(el) {
    const d = window.HUB_FECHAMENTO_DATA;
    const anos = anosDisponiveis(d.vagas);
    if (!anos.includes(state.ano)) anos.unshift(state.ano);
    const p = S().periodo(state.tipo, state.ano, state.n);
    const atualizadoEm = d.vagas.reduce((m, v) => (v.importado_em && v.importado_em > m ? v.importado_em : m), '').slice(0, 10);
    slidesAtuais = S().montar(p, { vagas: d.vagas, metas: d.metas, atualizadoEm });

    el.innerHTML = STYLE + `
      <div class="fx-top">
        <label>Tipo<select id="fx-tipo">${Object.keys(ROTULO_TIPO).map(t => `<option value="${t}" ${t === state.tipo ? 'selected' : ''}>${ROTULO_TIPO[t]}</option>`).join('')}</select></label>
        <label>Ano<select id="fx-ano">${anos.map(a => `<option value="${a}" ${a === state.ano ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        ${state.tipo === 'anual' ? '' : `<label>Período<select id="fx-n">${opcoesPeriodo(state.tipo).map(o => `<option value="${o.n}" ${o.n === state.n ? 'selected' : ''}>${esc(o.nome)}</option>`).join('')}</select></label>`}
        <div class="fx-acoes">
          <button class="fx-btn" id="fx-apresentar">${ICON.apresentar}Apresentar</button>
          <button class="fx-btn pri" id="fx-baixar">${ICON.baixar}Baixar PPTX</button>
        </div>
      </div>
      <p class="fx-info"><b>${esc(p.label)}</b> (${esc(p.de.split('-').reverse().join('/'))} a ${esc(p.ate.split('-').reverse().join('/'))}) · Recrutamento e Seleção a partir da planilha 18, atualizada em ${esc(atualizadoEm.split('-').reverse().join('/'))}. Os demais blocos do Fechamento entram nas próximas etapas.</p>
      <div class="fx-lista">${slidesAtuais.map((sd, i) => `
        <div>
          <div class="fx-cab"><span><b>${i + 1}.</b> ${esc(sd.nome)}</span></div>
          <div class="fx-quadro" data-i="${i}">${htmlSlide(sd, 'fx' + i)}</div>
          ${sd.notas ? `<details class="fx-notas"><summary>Como foi calculado</summary><p>${esc(sd.notas)}</p></details>` : ''}
        </div>`).join('')}
      </div>`;

    const lista = el.querySelector('.fx-lista');
    const largura = () => Math.min(lista.clientWidth || 1100, 1100);
    el.querySelectorAll('.fx-quadro').forEach(q => encaixar(q, largura()));
    slidesAtuais.forEach((sd, i) => desenharGraficos(sd, 'fx' + i));

    el.querySelector('#fx-tipo').addEventListener('change', e => { state.tipo = e.target.value; Object.assign(state, periodoPadrao(state.tipo)); desenhar(el); });
    el.querySelector('#fx-ano').addEventListener('change', e => { state.ano = +e.target.value; desenhar(el); });
    const selN = el.querySelector('#fx-n');
    if (selN) selN.addEventListener('change', e => { state.n = +e.target.value; desenhar(el); });
    el.querySelector('#fx-baixar').addEventListener('click', e => baixar(e.currentTarget, p));
    el.querySelector('#fx-apresentar').addEventListener('click', () => apresentar(0));
  }

  // Redimensiona os quadros sem redesenhar os gráficos (o Chart.js se ajusta sozinho).
  window.addEventListener('resize', () => {
    if (!elAtual || !elAtual.classList.contains('active')) return;
    const lista = elAtual.querySelector('.fx-lista');
    if (!lista) return;
    elAtual.querySelectorAll('.fx-lista .fx-quadro').forEach(q => encaixar(q, Math.min(lista.clientWidth || 1100, 1100)));
  });

  // ------------------------------------------------------------------
  // PowerPoint
  // ------------------------------------------------------------------
  async function paraDataUrl(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('Não consegui carregar ' + url);
    const blob = await r.blob();
    return new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = reject; fr.readAsDataURL(blob); });
  }

  async function baixar(btn, p) {
    const txt = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Gerando PPTX...';
    try {
      const fundos = {};
      for (const k of Object.keys(FUNDOS)) fundos[k] = await paraDataUrl(FUNDOS[k]);
      const pres = await HUB_FECHAMENTO_PPTX.gerar(slidesAtuais, { fundos, titulo: 'Fechamento RH — ' + p.label });
      await pres.writeFile({ fileName: `Fechamento RH - ${p.label}.pptx` });
    } catch (err) {
      alert('Não foi possível gerar o PowerPoint: ' + (err.message || err));
    } finally {
      btn.disabled = false;
      btn.innerHTML = txt;
    }
  }

  // ------------------------------------------------------------------
  // Modo apresentação: tela cheia, setas/espaço avançam, Esc sai.
  // ------------------------------------------------------------------
  function apresentar(inicio) {
    let i = inicio;
    const palco = document.createElement('div');
    palco.className = 'fx-palco';
    document.body.appendChild(palco);
    const mostrar = () => {
      palco.innerHTML = `<div class="fx-quadro">${htmlSlide(slidesAtuais[i], 'fxp')}</div><div class="fx-pg">${i + 1} / ${slidesAtuais.length}</div>`;
      const q = palco.querySelector('.fx-quadro');
      encaixar(q, Math.min(window.innerWidth, window.innerHeight * 16 / 9));
      desenharGraficos(slidesAtuais[i], 'fxp');
    };
    const sair = () => {
      document.removeEventListener('keydown', tecla);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      palco.remove();
    };
    const ir = delta => { const j = i + delta; if (j < 0) return; if (j >= slidesAtuais.length) { sair(); return; } i = j; mostrar(); };
    function tecla(e) {
      if (e.key === 'Escape') sair();
      else if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); ir(1); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); ir(-1); }
    }
    document.addEventListener('keydown', tecla);
    palco.addEventListener('click', () => ir(1));
    document.addEventListener('fullscreenchange', function f() { if (!document.fullscreenElement) { document.removeEventListener('fullscreenchange', f); if (palco.isConnected) sair(); } });
    if (palco.requestFullscreen) palco.requestFullscreen().then(mostrar, mostrar); else mostrar();
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderFechamento = renderFechamento;
})();
