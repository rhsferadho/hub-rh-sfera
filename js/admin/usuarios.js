// Administração → Cadastro de Acessos: cria/edita logins e a permissão
// granular de cada um (checkbox por módulo/funcionalidade — catálogo em
// js/permissions.js). Os botões "Administrador/Gestor/RH" só aplicam um
// preset de checkboxes de partida; o que vale de verdade, salvo no banco, é
// o mapa de checkboxes marcados no momento do envio. Gate: admin.usuarios.
(function () {
  const U = HUB_UTILS;
  const PERM = HUB_PERMISSIONS;

  let editingProfile = null;

  function orgOptions() {
    const colab = HUB_DATA.colaboradores || [];
    const unidades = U.uniqueSorted(colab.map(r => r.unidade));
    const porUnidade = new Map();
    for (const r of colab) {
      if (!r.unidade || !r.departamento) continue;
      if (!porUnidade.has(r.unidade)) porUnidade.set(r.unidade, new Set());
      porUnidade.get(r.unidade).add(r.departamento);
    }
    const departamentosPorUnidade = {};
    for (const [u, set] of porUnidade.entries()) departamentosPorUnidade[u] = U.uniqueSorted(Array.from(set));
    return { unidades, departamentosPorUnidade };
  }

  function render(el) {
    if (!PERM.hasPerm(HUB_USER, 'admin.usuarios')) {
      el.innerHTML = '<div class="empty"><p>Acesso restrito.</p></div>';
      return;
    }
    el.innerHTML = `<div class="grid2">
      <div class="card full"><h3>&#128100;&nbsp;Contas cadastradas</h3><div id="acc-list">Carregando...</div></div>
      <div class="card full" id="acc-form-card"></div>
    </div>`;
    try {
      renderAccessForm(document.getElementById('acc-form-card'));
    } catch (err) {
      document.getElementById('acc-form-card').innerHTML = `<div class="empty"><p>Erro ao montar o formulário: ${U.escapeHtml(err.message)}</p></div>`;
    }
    HUB_DAL.listProfiles()
      .then(profiles => renderAccessList(document.getElementById('acc-list'), profiles))
      .catch(err => { document.getElementById('acc-list').innerHTML = `<div class="empty"><p>Erro ao carregar contas: ${U.escapeHtml(err.message)}</p></div>`; });
  }

  function renderAccessList(el, profiles) {
    if (!profiles.length) { el.innerHTML = '<div class="empty"><p>Nenhuma conta cadastrada além da sua.</p></div>'; return; }
    el.innerHTML = `<div class="table-wrap"><table class="dt"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Permissões</th><th>Unidades</th><th>Departamentos</th><th></th></tr></thead><tbody>
      ${profiles.map(p => {
        const n = Object.values(p.permissoes || {}).filter(Boolean).length;
        return `<tr>
        <td>${U.escapeHtml(p.nome)}</td><td>${U.escapeHtml(p.email)}</td>
        <td><span class="badge b1">${PERM.PERFIL_LABELS[p.perfil] || p.perfil}</span></td>
        <td>${n} de ${PERM.ALL_KEYS.length}</td>
        <td>${(p.unidades || []).length ? U.escapeHtml(p.unidades.join(', ')) : '<em>Todas</em>'}</td>
        <td>${(p.departamentos || []).length ? U.escapeHtml(p.departamentos.join(', ')) : '<em>Todos</em>'}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-outline btn-sm" data-edit="${p.id}">Editar</button>
          <button class="btn btn-danger btn-sm" data-del="${p.id}">Remover</button>
        </td>
      </tr>`;
      }).join('')}
    </tbody></table></div>`;
    el.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
      const p = profiles.find(x => x.id === b.dataset.edit);
      editingProfile = p;
      renderAccessForm(document.getElementById('acc-form-card'));
      document.getElementById('acc-form-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }));
    el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Remover o acesso desta pessoa ao Hub Sfera? O login no Supabase não é excluído, só o acesso ao app.')) return;
      try { await HUB_DAL.deleteProfile(b.dataset.del); render(document.getElementById('sec-adm-usuarios')); }
      catch (err) { alert('Erro ao remover: ' + err.message); }
    }));
  }

  function renderAccessForm(el) {
    const { unidades, departamentosPorUnidade } = orgOptions();
    const isEdit = !!editingProfile;
    const p = editingProfile || { nome: '', email: '', perfil: 'gestor', unidades: [], departamentos: [], permissoes: PERM.presetPermissoes('gestor') };
    el.innerHTML = `
      <h3>&#128272;&nbsp;${isEdit ? 'Editar acesso' : 'Novo acesso'}</h3>
      <form id="acc-form">
        <div class="form-grid">
          <div class="field full"><label>Nome completo</label><input id="acc-nome" required value="${U.escapeHtml(p.nome)}"></div>
          <div class="field"><label>E-mail (login)</label><input id="acc-email" type="email" required value="${U.escapeHtml(p.email)}" ${isEdit ? 'disabled' : ''}></div>
          ${isEdit ? '' : '<div class="field"><label>Senha provisória</label><input id="acc-senha" type="password" minlength="6" required placeholder="mínimo 6 caracteres"></div>'}
        </div>

        <label style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Perfil (só um rótulo — aplica um preset de permissões abaixo)</label>
        <div class="perm-preset-bar" id="acc-presets">
          ${['admin', 'gestor', 'rh'].map(k => `<button type="button" data-perfil="${k}" class="${p.perfil === k ? 'btn-primary' : ''}" style="${p.perfil === k ? 'background:var(--p1);color:#fff;border-color:var(--p1)' : ''}">${PERM.PERFIL_LABELS[k]}</button>`).join('')}
        </div>

        <label style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Permissões — módulos e funcionalidades liberados</label>
        <div class="perm-groups" id="acc-perm-groups">
          ${PERM.CATALOG.map(g => `
            <div class="perm-group">
              <h4><span>${g.icon}</span>${g.groupLabel}</h4>
              ${g.items.map(it => `<label class="chk" style="width:100%;margin-bottom:4px"><input type="checkbox" data-perm="${it.key}" ${p.permissoes && p.permissoes[it.key] ? 'checked' : ''}>${it.label}</label>`).join('')}
            </div>`).join('')}
        </div>

        <div class="form-grid" id="acc-org-wrap">
          <div class="field full">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <label>Unidades liberadas (vazio = todas)</label>
              <span style="font-size:11px"><a href="#" id="acc-unidades-all" style="color:var(--p1)">selecionar todas</a> · <a href="#" id="acc-unidades-none" style="color:var(--muted)">limpar</a></span>
            </div>
            <div class="checks" id="acc-unidades">${unidades.map(u => `<label class="chk"><input type="checkbox" value="${U.escapeHtml(u)}" ${p.unidades.includes(u) ? 'checked' : ''}>${U.escapeHtml(u)}</label>`).join('') || '<span style="font-size:11.5px;color:var(--muted)">Importe a planilha de Colaboradores primeiro.</span>'}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px">
              <label>Departamentos liberados (vazio = todos os da unidade marcada)</label>
              <span style="font-size:11px"><a href="#" id="acc-departamentos-all" style="color:var(--p1)">selecionar todos</a> · <a href="#" id="acc-departamentos-none" style="color:var(--muted)">limpar</a></span>
            </div>
            <div class="checks" id="acc-departamentos"></div>
            <p class="sub" style="color:var(--muted);margin-top:6px">Vale para os dois módulos: restringe as linhas de Indicadores e, no Recrutamento, restringe por unidade (ver observação no rodapé).</p>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px">
          <button type="submit" class="btn btn-primary" style="width:auto" id="acc-submit">${isEdit ? 'Salvar alterações' : 'Criar acesso'}</button>
          ${isEdit ? '<button type="button" class="btn btn-outline" id="acc-cancel">Cancelar</button>' : ''}
        </div>
        <div class="msg err" id="acc-msg"></div>
        <p class="sub" style="color:var(--muted);margin-top:10px">No Recrutamento, "unidades liberadas" é comparado com o campo Unidade de cada vaga (ex.: "Boticário - Interior de MG", "Hering") — pode não usar exatamente a mesma lista de nomes que aparece nas planilhas de Indicadores.</p>
      </form>`;

    function checkedUnidades() {
      return Array.from(document.querySelectorAll('#acc-unidades input:checked')).map(i => i.value);
    }
    function renderDepartamentoChecks() {
      const selecionadas = checkedUnidades();
      const depWrap = document.getElementById('acc-departamentos');
      const previamenteMarcados = new Set(Array.from(depWrap.querySelectorAll('input:checked')).map(i => i.value));
      if (!selecionadas.length) {
        depWrap.innerHTML = '<span style="font-size:11.5px;color:var(--muted)">Marque ao menos uma unidade acima pra ver os departamentos dela — deixando sem marcar nenhuma, o acesso vale para todos os departamentos de todas as unidades liberadas.</span>';
        return;
      }
      const deptos = U.uniqueSorted(selecionadas.flatMap(u => departamentosPorUnidade[u] || []));
      depWrap.innerHTML = deptos.length
        ? deptos.map(d => `<label class="chk"><input type="checkbox" value="${U.escapeHtml(d)}" ${(p.departamentos.includes(d) || previamenteMarcados.has(d)) ? 'checked' : ''}>${U.escapeHtml(d)}</label>`).join('')
        : '<span style="font-size:11.5px;color:var(--muted)">Nenhum departamento encontrado para essa(s) unidade(s) na planilha de Colaboradores.</span>';
    }
    document.getElementById('acc-unidades').addEventListener('change', renderDepartamentoChecks);
    renderDepartamentoChecks();

    function setAllChecked(containerId, checked) {
      document.querySelectorAll('#' + containerId + ' input[type=checkbox]').forEach(i => { i.checked = checked; });
    }
    document.getElementById('acc-unidades-all').addEventListener('click', e => { e.preventDefault(); setAllChecked('acc-unidades', true); renderDepartamentoChecks(); });
    document.getElementById('acc-unidades-none').addEventListener('click', e => { e.preventDefault(); setAllChecked('acc-unidades', false); renderDepartamentoChecks(); });
    document.getElementById('acc-departamentos-all').addEventListener('click', e => { e.preventDefault(); setAllChecked('acc-departamentos', true); });
    document.getElementById('acc-departamentos-none').addEventListener('click', e => { e.preventDefault(); setAllChecked('acc-departamentos', false); });

    let perfilAtual = p.perfil;
    document.querySelectorAll('#acc-presets button').forEach(b => b.addEventListener('click', () => {
      perfilAtual = b.dataset.perfil;
      document.querySelectorAll('#acc-presets button').forEach(x => { x.classList.remove('btn-primary'); x.style.background = ''; x.style.color = ''; x.style.borderColor = ''; });
      b.classList.add('btn-primary'); b.style.background = 'var(--p1)'; b.style.color = '#fff'; b.style.borderColor = 'var(--p1)';
      const preset = PERM.presetPermissoes(perfilAtual);
      document.querySelectorAll('#acc-perm-groups input[data-perm]').forEach(chk => { chk.checked = !!preset[chk.dataset.perm]; });
    }));

    if (isEdit) document.getElementById('acc-cancel').addEventListener('click', () => { editingProfile = null; renderAccessForm(el); });
    document.getElementById('acc-form').addEventListener('submit', e => submitAccessForm(e, isEdit, () => perfilAtual));
  }

  async function submitAccessForm(e, isEdit, getPerfil) {
    e.preventDefault();
    const msg = document.getElementById('acc-msg');
    msg.style.display = 'none';
    const btn = document.getElementById('acc-submit');
    const nome = document.getElementById('acc-nome').value.trim();
    const email = document.getElementById('acc-email').value.trim();
    const perfil = getPerfil();
    const unidades = Array.from(document.querySelectorAll('#acc-unidades input:checked')).map(i => i.value);
    const departamentos = Array.from(document.querySelectorAll('#acc-departamentos input:checked')).map(i => i.value);
    const permissoes = {};
    document.querySelectorAll('#acc-perm-groups input[data-perm]').forEach(chk => { permissoes[chk.dataset.perm] = chk.checked; });

    btn.disabled = true;
    btn.textContent = 'Salvando...';
    try {
      if (isEdit) {
        await HUB_DAL.upsertProfile({ id: editingProfile.id, email, nome, perfil, unidades, departamentos, permissoes });
        editingProfile = null;
      } else {
        const senha = document.getElementById('acc-senha').value;
        const iso = window.createIsolatedClient();
        const { data, error } = await iso.auth.signUp({ email, password: senha });
        if (error) throw error;
        if (!data.user) throw new Error('Não foi possível criar o login (verifique se a confirmação de e-mail está desativada no Supabase — veja SETUP.md).');
        await HUB_DAL.upsertProfile({ id: data.user.id, email, nome, perfil, unidades, departamentos, permissoes });
      }
      render(document.getElementById('sec-adm-usuarios'));
    } catch (err) {
      msg.textContent = err.message || 'Erro ao salvar.';
      msg.style.display = 'block';
      btn.disabled = false;
      btn.textContent = isEdit ? 'Salvar alterações' : 'Criar acesso';
    }
  }

  window.HUB_ADMIN_USUARIOS = { render };
})();
