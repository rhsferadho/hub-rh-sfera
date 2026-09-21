// Administração → Upload de Planilhas: alimenta as tabelas do módulo
// Indicadores (tudo, exceto Recrutamento — que vem ao vivo do módulo
// Recrutamento, sem upload). Gate de acesso: permissão admin.upload.
(function () {
  const U = HUB_UTILS;
  const P = HUB_PARSERS;

  const UPLOADS = [
    { key: 'colaboradores', table: 'colaboradores', label: '1. Colaboradores', file: 'Colaboradores.xlsx', icon: '&#128101;', parse: wb => P.parseColaboradores(wb) },
    { key: 'feedbacks', table: 'feedbacks', label: '4. Feedbacks', file: 'Feedbacks.xlsx', icon: '&#128172;', parse: wb => P.parseFeedbacks(wb) },
    { key: 'oneonone', table: 'one_on_one', label: '5. 1 on 1', file: '1 on 1.xlsx', icon: '&#129309;', parse: wb => P.parseOneOnOne(wb) },
    { key: 'celebracoes', table: 'celebracoes', label: '20. Celebrações', file: 'Celebrações.xlsx', icon: '&#127881;', parse: wb => P.parseCelebracoes(wb) },
    { key: 'twygo_part', table: 'twygo_participantes', label: '27. Twygo', file: 'Twygo.xlsx', icon: '&#128218;', parse: wb => P.parseTwygoParticipantes(wb) },
    { key: 'twygo_usu', table: 'twygo_usuarios', label: '27.1. Twygo usuários', file: 'Twygo usuários.xlsx', icon: '&#128100;', parse: wb => P.parseTwygoUsuarios(wb) },
    { key: 'twygo_cont', table: 'twygo_conteudos', label: '27.1. Twygo conteúdos', file: 'Twygo conteúdos.xlsx', icon: '&#127891;', parse: wb => P.parseTwygoConteudos(wb) },
    { key: 'ave45', table: 'avaliacao_experiencia_45', label: '28. Avaliação da Experiência — 45 dias', file: 'AVE 45 DIAS.xlsx', icon: '&#128221;', parse: wb => P.parseAveExperiencia(wb, 45) },
    { key: 'ave90', table: 'avaliacao_experiencia_90', label: '28.1. Avaliação da Experiência — 90 dias', file: 'AVE 90 DIAS.xlsx', icon: '&#128221;', parse: wb => P.parseAveExperiencia(wb, 90) }
  ];

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDT = iso => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };
  // Cor do "atualizado em": verde ≤7 dias, amarelo ≤30, vermelho acima disso.
  function ageColor(iso) {
    const days = (Date.now() - new Date(iso).getTime()) / 86400000;
    return days <= 7 ? '#0f8a4c' : days <= 30 ? '#b7791f' : 'var(--critical)';
  }

  function renderLastUpdate(key, entry) {
    const el = document.getElementById('lu-' + key);
    if (!el) return;
    if (!entry) { el.style.color = 'var(--muted)'; el.textContent = 'Nunca atualizado'; return; }
    el.style.color = ageColor(entry.created_at);
    el.textContent = `Atualizado em ${fmtDT(entry.created_at)}` + (entry.usuario_nome ? ' · ' + entry.usuario_nome : '') + (entry.linhas != null ? ' · ' + U.fmtInt(entry.linhas) + ' linhas' : '');
  }

  async function loadLastUpdates() {
    try {
      const log = await HUB_DAL.listUploadLog(500);
      UPLOADS.forEach(u => renderLastUpdate(u.key, log.find(l => l.tabela === u.table && l.status === 'ok')));
    } catch (err) {
      UPLOADS.forEach(u => {
        const el = document.getElementById('lu-' + u.key);
        if (el) { el.style.color = 'var(--muted)'; el.textContent = 'Histórico indisponível'; el.title = err.message; }
      });
    }
  }

  async function openHistory() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px';
    overlay.innerHTML = `<div style="background:var(--card);border-radius:var(--radius);max-width:820px;width:100%;max-height:85vh;display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--border)">
        <h3 style="font-size:15px">Histórico de uploads</h3>
        <div style="display:flex;gap:8px;align-items:center">
          <select id="uh-filter" style="font-size:12px"><option value="">Todas as planilhas</option>${UPLOADS.map(u => `<option value="${u.table}">${u.label}</option>`).join('')}</select>
          <button type="button" id="uh-close" aria-label="Fechar">&times;</button>
        </div>
      </div>
      <div id="uh-body" style="overflow:auto;padding:14px 18px;font-size:12px">Carregando...</div>
    </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#uh-close').addEventListener('click', close);
    const body = overlay.querySelector('#uh-body');
    let log = [];
    const draw = () => {
      const f = overlay.querySelector('#uh-filter').value;
      const rows = log.filter(l => !f || l.tabela === f);
      if (!rows.length) { body.textContent = 'Nenhum upload registrado.'; return; }
      body.innerHTML = `<table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;color:var(--muted)"><th>Data e hora</th><th>Planilha</th><th>Usuário</th><th>Arquivo</th><th>Linhas</th><th>Status</th></tr></thead><tbody>${rows.map(l => {
        const cfg = UPLOADS.find(u => u.table === l.tabela);
        const ok = l.status === 'ok';
        return `<tr style="border-top:1px solid var(--border)"><td>${fmtDT(l.created_at)}</td><td>${esc(cfg ? cfg.label : l.tabela)}</td><td>${esc(l.usuario_nome || '—')}</td><td>${esc(l.arquivo || '—')}</td><td>${l.linhas != null ? U.fmtInt(l.linhas) : '—'}</td><td style="color:${ok ? '#0f8a4c' : 'var(--critical)'}" title="${esc(l.erro || '')}">${ok ? 'Sucesso' : 'Erro'}</td></tr>`;
      }).join('')}</tbody></table>`;
    };
    overlay.querySelector('#uh-filter').addEventListener('change', draw);
    try { log = await HUB_DAL.listUploadLog(300); draw(); }
    catch (err) { body.textContent = 'Não foi possível carregar o histórico: ' + err.message; }
  }

  function render(el) {
    if (!HUB_PERMISSIONS.hasPerm(HUB_USER, 'admin.upload')) {
      el.innerHTML = '<div class="empty"><p>Acesso restrito.</p></div>';
      return;
    }
    el.innerHTML = `<div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button type="button" id="btn-upload-history">Ver histórico de uploads</button></div>
      <div class="upload-grid">${UPLOADS.map(u => `
      <div class="upload-card" id="uc-${u.key}">
        <span class="ic">${u.icon}</span>
        <h4>${u.label}</h4>
        <p>Arquivo: ${u.file}</p>
        <p id="lu-${u.key}" style="margin-top:4px;font-weight:600;color:var(--muted)">Carregando...</p>
        <input type="file" accept=".xlsx,.xls,.csv" data-key="${u.key}">
        <div class="progress" id="pg-${u.key}" style="display:none"><div></div></div>
        <div class="status" id="st-${u.key}"></div>
      </div>`).join('')}</div>
      <p class="sub" style="color:var(--muted);font-size:11.5px">Cada upload substitui completamente os dados daquela planilha — pode reenviar quantas vezes precisar, sempre com o mesmo modelo de colunas. Os indicadores de Recrutamento não aparecem aqui: eles são lidos automaticamente das telas do módulo Recrutamento.</p>`;
    el.querySelectorAll('input[type=file]').forEach(inp => inp.addEventListener('change', e => handleUpload(e.target.dataset.key, e.target.files[0])));
    el.querySelector('#btn-upload-history').addEventListener('click', openHistory);
    loadLastUpdates();
  }

  async function handleUpload(key, file) {
    if (!file) return;
    const cfg = UPLOADS.find(u => u.key === key);
    const card = document.getElementById('uc-' + key);
    const statusEl = document.getElementById('st-' + key);
    const pg = document.getElementById('pg-' + key);
    const bar = pg.querySelector('div');
    card.classList.add('busy');
    card.classList.remove('ok');
    statusEl.className = 'status';
    statusEl.textContent = 'Lendo arquivo...';
    pg.style.display = 'block';
    bar.style.width = '5%';
    try {
      const wb = await P.readWorkbook(file);
      const rows = cfg.parse(wb);
      statusEl.textContent = `Gravando (${rows.length} linhas)...`;
      await HUB_DAL.replaceTable(cfg.table, rows, (done, total) => { bar.style.width = (5 + (done / Math.max(total, 1)) * 90) + '%'; });
      statusEl.textContent = `${rows.length} linhas importadas.`;
      bar.style.width = '100%';
      statusEl.classList.add('ok-t');
      card.classList.add('ok');
      // Avaliação da Experiência não entra em HUB_DATA (carregada sob
      // demanda): descarta o cache do ciclo para a próxima abertura buscar
      // as linhas novas (que só ganham "id" no banco).
      const cicloAve = window.HUB_EXPERIENCIA && HUB_EXPERIENCIA.cicloDaTabela(cfg.table);
      if (cicloAve) HUB_EXPERIENCIA.invalidar(cicloAve);
      await HUB_DAL.logUpload({ tabela: cfg.table, arquivo: file.name, linhas: rows.length, status: 'ok' });
      await HUB_RELOAD_DATA(false);
      loadLastUpdates();
    } catch (err) {
      statusEl.classList.add('err-t');
      statusEl.textContent = err.message || 'Erro ao importar.';
      await HUB_DAL.logUpload({ tabela: cfg.table, arquivo: file.name, status: 'erro', erro: err.message }).catch(() => {});
    } finally {
      card.classList.remove('busy');
      setTimeout(() => { pg.style.display = 'none'; bar.style.width = '0%'; }, 1500);
    }
  }

  window.HUB_ADMIN_UPLOAD = { render };
})();
