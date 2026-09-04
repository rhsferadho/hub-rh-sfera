// Catálogo único de permissões do Hub Sfera. Cada item vira: (1) um checkbox
// na tela Administração → Cadastro de Acessos, (2) um item de navegação na
// barra lateral (só aparece se HUB_USER.permissoes[key] === true), (3) a
// chave lida por has_permission(key) nas policies de RLS do Supabase — os
// três lugares têm que usar exatamente as mesmas strings.
(function () {
  // Agrupado em 3 blocos, na ordem em que aparecem na barra lateral e no
  // formulário de cadastro de acessos.
  const CATALOG = [
    {
      group: 'indicadores', groupLabel: 'Indicadores', icon: '&#128202;',
      items: [
        { key: 'indicadores.headcount', label: 'Headcount' },
        { key: 'indicadores.recrutamento', label: 'Recrutamento' },
        { key: 'indicadores.rotatividade', label: 'Rotatividade' },
        { key: 'indicadores.desligamento', label: 'Entrevistas de Desligamento' },
        { key: 'indicadores.feedbacks', label: 'Feedbacks' },
        { key: 'indicadores.oneonone', label: '1:1' },
        { key: 'indicadores.treinamentos', label: 'Treinamentos' },
        { key: 'indicadores.celebracoes', label: 'Celebrações' }
      ]
    },
    {
      group: 'recrutamento', groupLabel: 'Recrutamento', icon: '&#128188;',
      items: [
        { key: 'recrutamento.dashboard', label: 'Dashboard' },
        { key: 'recrutamento.vagas', label: 'Controle de Vagas' },
        { key: 'recrutamento.candidatos', label: 'Candidatos' },
        { key: 'recrutamento.agenda', label: 'Agenda de Entrevistas' },
        { key: 'recrutamento.banco_talentos', label: 'Banco de Talentos' },
        { key: 'recrutamento.aprovacoes', label: 'Aprovações' },
        { key: 'recrutamento.historico', label: 'Histórico' },
        { key: 'recrutamento.transferencia', label: 'Transferência de Vaga' }
      ]
    },
    {
      group: 'treinamento_dev', groupLabel: 'Treinamento e Desenvolvimento', icon: '&#127891;',
      items: [
        { key: 'treinamento_dev.onboarding', label: 'Onboarding' }
      ]
    },
    {
      group: 'administracao', groupLabel: 'Administração', icon: '&#9881;&#65039;',
      items: [
        { key: 'admin.upload', label: 'Upload de Planilhas (Indicadores)' },
        { key: 'admin.cadastros_recrutamento', label: 'Cadastros do Recrutamento' },
        { key: 'admin.usuarios', label: 'Cadastro de Acessos' }
      ]
    }
  ];

  const ALL_KEYS = CATALOG.flatMap(g => g.items.map(i => i.key));

  // Presets só marcam um ponto de partida no formulário — depois de aplicar,
  // o administrador pode ligar/desligar qualquer checkbox individualmente.
  // O perfil (admin/gestor/rh) salvo no profile é só um rótulo/histórico de
  // qual preset foi usado por último, não uma trava de acesso.
  const PRESETS = {
    admin: ALL_KEYS,
    rh: ALL_KEYS.filter(k => k !== 'admin.usuarios'),
    gestor: CATALOG.find(g => g.group === 'indicadores').items.map(i => i.key)
  };

  const PERFIL_LABELS = { admin: 'Administrador', gestor: 'Gestor', rh: 'RH' };

  function hasPerm(user, key) {
    return !!(user && user.permissoes && user.permissoes[key] === true);
  }

  function hasAnyPerm(user, keys) {
    return keys.some(k => hasPerm(user, k));
  }

  function presetPermissoes(perfil) {
    const keys = PRESETS[perfil] || [];
    const map = {};
    for (const k of keys) map[k] = true;
    return map;
  }

  window.HUB_PERMISSIONS = { CATALOG, ALL_KEYS, PRESETS, PERFIL_LABELS, hasPerm, hasAnyPerm, presetPermissoes };
})();
