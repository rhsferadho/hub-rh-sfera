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
        { key: 'indicadores.headcount', label: 'Headcount (sem a permissão abaixo: só a própria pessoa e a equipe abaixo dela, também nos números de headcount do Dashboard)' },
        { key: 'indicadores.headcount_completo', label: 'Headcount — ver todos os colaboradores' },
        { key: 'indicadores.organograma', label: 'Organograma (sem a permissão abaixo: só o próprio galho, da liderança acima até a equipe abaixo)' },
        { key: 'indicadores.organograma_completo', label: 'Organograma — ver a estrutura completa da empresa' },
        { key: 'indicadores.recrutamento', label: 'Recrutamento' },
        { key: 'indicadores.rotatividade', label: 'Rotatividade' },
        { key: 'indicadores.experiencia', label: 'Avaliação da Experiência' },
        { key: 'indicadores.desligamento', label: 'Entrevistas de Desligamento' },
        { key: 'indicadores.desligamento_gerar_link', label: 'Entrevistas de Desligamento — Gerar link' },
        { key: 'indicadores.controle_desligamento', label: 'Entrevistas de Desligamento — Controle de Desligamento (restrito: dados pessoais e contato; liberar individualmente)' },
        { key: 'indicadores.feedbacks', label: 'Feedbacks' },
        { key: 'indicadores.oneonone', label: '1:1' },
        { key: 'indicadores.treinamentos', label: 'Treinamentos' },
        { key: 'indicadores.celebracoes', label: 'Celebrações' },
        { key: 'indicadores.pesquisa_clima', label: 'Pesquisa de Clima — resultados e comentários (dado sensível: liberar só RH/diretoria)' }
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
        { key: 'recrutamento.transferencia', label: 'Transferência de Vaga' },
        { key: 'recrutamento.parecer_gestor', label: 'Parecer do Gestor' }
      ]
    },
    {
      group: 'treinamento_dev', groupLabel: 'Treinamento e Desenvolvimento', icon: '&#127891;',
      items: [
        { key: 'treinamento_dev.onboarding', label: 'Onboarding' },
        { key: 'treinamento_dev.visita_loja', label: 'Visita em Loja' }
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
    // Controle de Desligamento fica fora de todos os presets: tem contato
    // (celular) e dados pessoais de ex-colaboradores — só é ligado usuário a
    // usuário pelo administrador.
    rh: ALL_KEYS.filter(k => k !== 'admin.usuarios' && k !== 'indicadores.controle_desligamento'),
    // "Gerar link" da Entrevista de Desligamento e a Avaliação da Experiência
    // ficam de fora do preset Gestor de propósito — envolvem dado sensível
    // (CPF/e-mail de ex-colaborador; nota individual e decisão de aprovar ou
    // reprovar cada colaborador) e devem ser ligados individualmente pelo
    // administrador, não vir junto de tudo mais que já é padrão pra esse perfil.
    // O Organograma e o Headcount completos também ficam de fora: o gestor vê só o próprio
    // galho (liderança acima + equipe abaixo), ver supabase-organograma.sql.
    gestor: CATALOG.find(g => g.group === 'indicadores').items.map(i => i.key)
      .filter(k => k !== 'indicadores.desligamento_gerar_link' && k !== 'indicadores.controle_desligamento' && k !== 'indicadores.experiencia' && k !== 'indicadores.pesquisa_clima' && k !== 'indicadores.organograma_completo' && k !== 'indicadores.headcount_completo')
      .concat(['recrutamento.parecer_gestor'])
  };

  const PERFIL_LABELS = { admin: 'Administrador', gestor: 'Gestor', rh: 'RH' };

  // perfil='admin' sempre enxerga tudo, mesmo que o mapa `permissoes`
  // salvo esteja desatualizado em relação ao catálogo atual (ex.: a conta
  // foi criada antes de uma permissão nova existir) — mesma regra de
  // has_permission() no SQL (supabase-migration.sql), pra não haver telas
  // que o backend libera pro admin mas o menu esconde.
  function hasPerm(user, key) {
    if (!user) return false;
    if (user.perfil === 'admin') return true;
    return !!(user.permissoes && user.permissoes[key] === true);
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
