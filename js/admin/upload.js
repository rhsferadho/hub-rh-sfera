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
    { key: 'entrevista', table: null, label: '34. Nova Entrevista de Desligamento', file: 'Nova Entrevista de Desligamento.xlsx', icon: '&#128682;', parse: wb => P.parseEntrevistaDesligamento(wb), multi: true },
    { key: 'twygo_part', table: 'twygo_participantes', label: '27. Twygo', file: 'Twygo.xlsx', icon: '&#128218;', parse: wb => P.parseTwygoParticipantes(wb) },
    { key: 'twygo_usu', table: 'twygo_usuarios', label: '27.1. Twygo usuários', file: 'Twygo usuários.xlsx', icon: '&#128100;', parse: wb => P.parseTwygoUsuarios(wb) },
    { key: 'twygo_cont', table: 'twygo_conteudos', label: '27.1. Twygo conteúdos', file: 'Twygo conteúdos.xlsx', icon: '&#127891;', parse: wb => P.parseTwygoConteudos(wb) }
  ];

  function render(el) {
    if (!HUB_PERMISSIONS.hasPerm(HUB_USER, 'admin.upload')) {
      el.innerHTML = '<div class="empty"><p>Acesso restrito.</p></div>';
      return;
    }
    el.innerHTML = `<div class="upload-grid">${UPLOADS.map(u => `
      <div class="upload-card" id="uc-${u.key}">
        <span class="ic">${u.icon}</span>
        <h4>${u.label}</h4>
        <p>Arquivo: ${u.file}</p>
        <input type="file" accept=".xlsx,.xls" data-key="${u.key}">
        <div class="progress" id="pg-${u.key}" style="display:none"><div></div></div>
        <div class="status" id="st-${u.key}"></div>
      </div>`).join('')}</div>
      <p class="sub" style="color:var(--muted);font-size:11.5px">Cada upload substitui completamente os dados daquela planilha — pode reenviar quantas vezes precisar, sempre com o mesmo modelo de colunas. Os indicadores de Recrutamento não aparecem aqui: eles são lidos automaticamente das telas do módulo Recrutamento.</p>`;
    el.querySelectorAll('input[type=file]').forEach(inp => inp.addEventListener('change', e => handleUpload(e.target.dataset.key, e.target.files[0])));
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
      if (cfg.multi) {
        const { pesquisa, solicitacao } = cfg.parse(wb);
        statusEl.textContent = `Gravando (${pesquisa.length + solicitacao.length} linhas)...`;
        await HUB_DAL.replaceTable('entrevista_pesquisa', pesquisa, (done, total) => { bar.style.width = (5 + (done / Math.max(total, 1)) * 45) + '%'; });
        await HUB_DAL.replaceTable('entrevista_solicitacao', solicitacao, (done, total) => { bar.style.width = (50 + (done / Math.max(total, 1)) * 45) + '%'; });
        statusEl.textContent = `${pesquisa.length + solicitacao.length} linhas importadas.`;
      } else {
        const rows = cfg.parse(wb);
        statusEl.textContent = `Gravando (${rows.length} linhas)...`;
        await HUB_DAL.replaceTable(cfg.table, rows, (done, total) => { bar.style.width = (5 + (done / Math.max(total, 1)) * 90) + '%'; });
        statusEl.textContent = `${rows.length} linhas importadas.`;
      }
      bar.style.width = '100%';
      statusEl.classList.add('ok-t');
      card.classList.add('ok');
      await HUB_RELOAD_DATA(false);
    } catch (err) {
      statusEl.classList.add('err-t');
      statusEl.textContent = err.message || 'Erro ao importar.';
    } finally {
      card.classList.remove('busy');
      setTimeout(() => { pg.style.display = 'none'; bar.style.width = '0%'; }, 1500);
    }
  }

  window.HUB_ADMIN_UPLOAD = { render };
})();
