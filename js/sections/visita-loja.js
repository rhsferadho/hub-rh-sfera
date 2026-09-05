// Treinamento e Desenvolvimento → Visita em Loja. Porta o formulário
// "Avaliação de Visita em Loja - O Boticário" (PDF fornecido pelo usuário,
// exportado do Microsoft Forms) para dentro do hub, no mesmo molde de
// Vagas/Candidatos: lista com painel de indicadores + botão "+ Nova Visita"
// que abre um assistente de várias etapas (mesma arquitetura do wizard
// "Nova Vaga" em vagas.js — stepper, um passo por seção do formulário
// original), gravado de uma vez só ao final (não incremental).
//
// Cada pergunta do PDF virou um item de um array declarativo (campo, rótulo,
// tipo, opções, condição de exibição) — em vez de repetir a cada uma das
// ~60 perguntas o HTML de campo na mão, um renderizador genérico
// (renderPergunta) monta o campo certo (select/texto/data/escala 0-10) e
// aplica a mesma regra do PDF: toda pergunta visível é obrigatória, exceto a
// nota geral final (Pergunta 76 do PDF, a única sem *).
//
// Observação sobre a estrutura do PDF: a pergunta "Selecione a Loja -
// Interior de MG" aparecia repetida 3x (mesmas opções, mesmo destino) — um
// artefato da exportação do Microsoft Forms para PDF, não 3 perguntas
// diferentes. Aqui existe só uma vez, como as demais ("Selecione a Loja"),
// com a lista de opções variando de acordo com a Área escolhida.
(function () {
  const U = HUB_UTILS;
  const R = HUB_RECRUIT;

  function D() { return window.HUB_RECRUIT_DATA || {}; }
  function canWrite() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'treinamento_dev.visita_loja'); }

  const SIMNAO = ['Sim', 'Não'];
  const NIVEL4 = ['Ruim', 'Regular', 'Bom', 'Excelente'];

  const AREAS = ['O Boticário Juiz de Fora', 'O Boticário Rio de Janeiro', 'O Boticário Interior de MG', 'O Boticário VD - Juiz de Fora', 'O Boticário VD - Rio de Janeiro', 'O Boticário VD - Interior de MG'];
  const LOJAS_POR_AREA = {
    'O Boticário Juiz de Fora': ['O Boticário Halfeld', 'O Boticário Independência', 'O Boticário Carrefour Rio Branco', 'O Boticário Santa Cruz', 'O Boticário Marechal', 'O Boticário Mister', 'O Boticário Alameda', 'O Boticário 3R Galeria', 'O Boticário 3R Quiosque', 'O Boticário Jardim Norte'],
    'O Boticário Rio de Janeiro': ['O Boticário Valqueire', 'O Boticário São Gonçalo Shop', 'O Boticário Sulacap', 'O Boticário Rodo', 'O Boticário Norte Shop P1', 'O Boticário Norte Shop P2', 'O Boticário Guanabara', 'O Boticário Alcântara', 'O Boticário Calçadão Madu', 'O Boticário Madureira Shop', 'O Boticário Polo 01', 'O Boticário Mercadão', 'O Boticário Carrefour', 'O Boticário Partage', 'O Boticário Campinho'],
    'O Boticário Interior de MG': ['Caratinga Olegário (MG)', 'Caratinga Raul (MG)', 'O Boticário Ipanema (MG)', 'Inhapim (MG)', 'Aimorés (MG)', 'O Boticário Raul Soares (MG)', 'Carangola (MG)', 'O Boticário Manhumirim (MG)', 'O Boticário Manhuaçu (MG)', 'Espera Feliz (MG)', 'O Boticário Leopoldina (MG)', 'O Boticário Santos Dumont (MG)', 'O Boticário Barroso (MG)', 'O Boticário Carandaí (MG)', 'O Boticário Além Paraíba (MG)'],
    'O Boticário VD - Juiz de Fora': ['O Boticário VD Sorrento Benfica', 'O Boticário VD Sorrento Centro', 'O Boticário VD Liva'],
    'O Boticário VD - Rio de Janeiro': ['O Boticário VD Madureira', 'O Boticário VD Partage'],
    'O Boticário VD - Interior de MG': ['Aimorés VD (MG)', 'O Boticário VD Manhuaçu (MG)', 'Carangola VD (MG)', 'Caratinga VD (MG)', 'O Boticário VD Santos Dumont (MG)', 'O Boticário VD Raul Soares (MG)', 'O Boticário VD Além Paraíba (MG)', 'O Boticário VD Leopoldina (MG)']
  };

  function selOpts(arr, val, emptyLabel) {
    return `<option value="">${emptyLabel || '— selecione —'}</option>` + (arr || []).map(o => `<option value="${U.escapeHtml(o)}" ${val === o ? 'selected' : ''}>${U.escapeHtml(o)}</option>`).join('');
  }

  // ================================================================
  // Perguntas — uma entrada por pergunta do PDF. `showIf` decide se a
  // pergunta aparece (e passa a ser obrigatória) de acordo com a resposta
  // de uma pergunta anterior — mesma lógica das "ramificações" do formulário
  // original.
  // ================================================================
  function perguntasPrincipais(d) {
    return [
      { field: 'area', label: 'Qual área você está visitando?', tipo: 'escolha', opcoes: AREAS },
      { field: 'loja', label: 'Selecione a Loja', tipo: 'escolha', opcoes: LOJAS_POR_AREA[d.area] || [], showIf: dd => !!dd.area },
      { field: 'dataVisita', label: 'Em que data a visita aconteceu?', tipo: 'data' },
      { field: 'todosPresentes', label: 'Todos os colaboradores estavam presentes?', tipo: 'escolha', opcoes: SIMNAO },
      { field: 'colaboradoresAusentes', label: 'Qual ou quais colaboradores estavam ausentes?', tipo: 'texto', showIf: dd => dd.todosPresentes === 'Não' },
      { field: 'justificativaAusencia', label: 'Qual a justificativa para ausência?', tipo: 'texto', showIf: dd => dd.todosPresentes === 'Não' }
    ];
  }

  const PERGUNTAS_EQUIPE = [
    { field: 'climaEquipe', label: 'Como você avalia o clima entre os colaboradores em Loja?', tipo: 'escolha', opcoes: NIVEL4 },
    { field: 'climaMelhorar', label: 'O que você entende que precisa melhorar?', tipo: 'texto', showIf: d => ['Ruim', 'Regular'].includes(d.climaEquipe) },
    { field: 'climaExemplo', label: 'Quais pontos você entende que podem servir de exemplo ou ser replicado como modelo?', tipo: 'texto', showIf: d => ['Bom', 'Excelente'].includes(d.climaEquipe) },
    { field: 'uniformizados', label: 'Todos estavam uniformizados e com boa apresentação pessoal?', tipo: 'escolha', opcoes: SIMNAO },
    { field: 'naoUniformizados', label: 'Qual ou quais colaboradores não estavam uniformizados/com boa apresentação pessoal?', tipo: 'texto', showIf: d => d.uniformizados === 'Não' },
    { field: 'justificativaUniforme', label: 'Qual a justificativa?', tipo: 'texto', showIf: d => d.uniformizados === 'Não' },
    { field: 'posturaGerente', label: 'Como você avalia a postura do(a) Gerente em Loja?', tipo: 'escolha', opcoes: NIVEL4 },
    { field: 'posturaGerenteMelhorar', label: 'O que você entende que pode melhorar em relação à postura do(a) Gerente?', tipo: 'texto', showIf: d => ['Ruim', 'Regular'].includes(d.posturaGerente) },
    { field: 'posturaGerenteExemplo', label: 'O que você viu em relação à postura do(a) Gerente, que seja um exemplo a ser seguido e replicado?', tipo: 'texto', showIf: d => ['Bom', 'Excelente'].includes(d.posturaGerente) },
    { field: 'posturaConsultores', label: 'Como você avalia a postura do(a)s Consultores/Vendedores em Loja?', tipo: 'escolha', opcoes: NIVEL4 },
    { field: 'posturaConsultoresMelhorar', label: 'O que você entende que pode melhorar em relação à postura do(a)s Consultores/Vendedores?', tipo: 'texto', showIf: d => ['Ruim', 'Regular'].includes(d.posturaConsultores) },
    { field: 'posturaConsultoresExemplo', label: 'O que você viu em relação à postura do(a)s Consultores/Vendedores, que seja um exemplo a ser seguido e replicado?', tipo: 'texto', showIf: d => ['Bom', 'Excelente'].includes(d.posturaConsultores) },
    { field: 'iniciativaTime', label: 'Como você classifica, de modo geral, o senso de iniciativa do time?', tipo: 'escolha', opcoes: NIVEL4 },
    { field: 'iniciativaTimeMelhorar', label: 'O que você entende que pode melhorar em relação ao senso de iniciativa do time?', tipo: 'texto', showIf: d => ['Ruim', 'Regular'].includes(d.iniciativaTime) },
    { field: 'iniciativaTimeExemplo', label: 'O que você viu em relação ao senso de iniciativa do time, que seja um exemplo a ser seguido e replicado?', tipo: 'texto', showIf: d => ['Bom', 'Excelente'].includes(d.iniciativaTime) }
  ];

  const PERGUNTAS_BOTILEZA = [
    { field: 'seApresentam', label: 'Os Consultores/Vendedores se apresentam adequadamente?', tipo: 'escolha', opcoes: SIMNAO },
    { field: 'naoSeApresentam', label: 'Quais os Consultores/Vendedores não se apresentam adequadamente?', tipo: 'texto', showIf: d => d.seApresentam === 'Não' },
    { field: 'perguntamMotivo', label: 'Os Consultores/Vendedores perguntam o motivo da visita do cliente?', tipo: 'escolha', opcoes: SIMNAO },
    { field: 'naoPerguntamMotivo', label: 'Quais os Consultores/Vendedores não perguntam o motivo da visita do cliente?', tipo: 'texto', showIf: d => d.perguntamMotivo === 'Não' },
    { field: 'perguntamNome', label: 'Os Consultores/Vendedores perguntam o nome do cliente?', tipo: 'escolha', opcoes: SIMNAO },
    { field: 'naoPerguntamNome', label: 'Quais os Consultores/Vendedores não perguntam o nome do cliente?', tipo: 'texto', showIf: d => d.perguntamNome === 'Não' },
    { field: 'momentoCpf', label: 'Os vendedores solicitam o CPF no início, meio ou fim do atendimento?', tipo: 'escolha', opcoes: ['Início', 'Meio', 'Fim', 'Não perguntaram'] },
    { field: 'quaisNaoCpfInicio', label: 'Quais os colaboradores solicitaram no meio ou no fim do atendimento, ou não perguntaram?', tipo: 'texto', showIf: d => !!d.momentoCpf && d.momentoCpf !== 'Início' },
    { field: 'explicamFidelidade', label: 'O(a)s Consultor(a)s estão explicando sobre o motivo da solicitação do CPF, comentando sobre o programa de fidelidade (benefícios, pontos, promoções ou descontos)?', tipo: 'escolha', opcoes: SIMNAO },
    { field: 'naoExplicamFidelidade', label: 'Quais Consultor(a)s não estão explicando sobre o motivo da solicitação do CPF, comentando sobre o programa de fidelidade?', tipo: 'texto', showIf: d => d.explicamFidelidade === 'Não' },
    { field: 'incentivamExperimentar', label: 'O(a)s Consultor(a)s estão incentivando o cliente a experimentar os produtos?', tipo: 'escolha', opcoes: SIMNAO },
    { field: 'naoIncentivamExperimentar', label: 'Quais Consultor(a)s não estão incentivando o cliente a experimentar os produtos?', tipo: 'texto', showIf: d => d.incentivamExperimentar === 'Não' },
    { field: 'ofereceAdicional', label: 'O(a)s Consultor(a)s estão oferecendo algum produto/promoção adicional além do que o cliente estava buscando?', tipo: 'escolha', opcoes: SIMNAO },
    { field: 'naoOfereceAdicional', label: 'Quais Consultor(a)s não estão oferecendo algum produto/promoção adicional além do que o cliente estava buscando?', tipo: 'texto', showIf: d => d.ofereceAdicional === 'Não' },
    { field: 'borrifaFragrancia', label: 'O(a)s Consultor(a)s estão borrifando alguma fragrância na sacola do cliente?', tipo: 'escolha', opcoes: SIMNAO },
    { field: 'naoBorrifaFragrancia', label: 'Quais os Consultor(a)s não estão borrifando alguma fragrância na sacola do cliente?', tipo: 'texto', showIf: d => d.borrifaFragrancia === 'Não' },
    { field: 'mencionaBotiRecicla', label: 'O(a)s Consultor(a)s estão mencionando sobre o Boti Recicla?', tipo: 'escolha', opcoes: SIMNAO },
    { field: 'naoMencionaBotiRecicla', label: 'Quais Consultor(a)s não estão mencionando sobre o Boti Recicla?', tipo: 'texto', showIf: d => d.mencionaBotiRecicla === 'Não' },
    { field: 'etapasExperimentacao', label: 'O(a)s Consultor(a)s estão realizando as etapas de experimentação com o cliente?', tipo: 'escolha', opcoes: ['Sim', 'Não', 'Em parte'] },
    { field: 'etapasExperimentacaoFalta', label: 'Qual(is) Consultor(a)s não estão fazendo ou fazendo em parte? E o que falta?', tipo: 'texto', showIf: d => !!d.etapasExperimentacao && d.etapasExperimentacao !== 'Sim' },
    { field: 'incentivaBeautybox', label: 'O(a)s Consultor(a)s estão incentivando o cliente a realizar os desafios do BeautyBox?', tipo: 'escolha', opcoes: SIMNAO },
    { field: 'naoIncentivaBeautybox', label: 'Quais Consultor(a)s não estão incentivando o cliente a realizar os desafios do BeautyBox?', tipo: 'texto', showIf: d => d.incentivaBeautybox === 'Não' }
  ];

  const PERGUNTAS_VENDAS360 = [
    { field: 'entendeuDesejo', label: 'Soube entender o desejo inicial de compra do cliente?', hint: 'Ex.: Maria, você tem algum produto em mente? Qual produto o Boticário você usa ou conhece? Qual tipo de fragrância você se identifica? Mais doce? Mais suave?', tipo: 'escolha', opcoes: ['Não', 'Parcialmente', 'Sim'] },
    { field: 'entendeuDesejoMelhorar', label: 'Qual consultor(a) não soube identificar e o que você entende que ainda precisa ser melhorado em relação a este ponto?', tipo: 'texto', showIf: d => !!d.entendeuDesejo && d.entendeuDesejo !== 'Sim' },
    { field: 'falouPrecoQuandoPerguntado', label: 'Atendendo o desejo inicial do cliente, FALOU SOBRE O PREÇO apenas quando o cliente perguntou? A consultora seguiu essa regra?', tipo: 'escolha', opcoes: SIMNAO },
    { field: 'precoNaoSeguiram', label: 'Quais consultor(e)s não seguiram essa regra?', tipo: 'texto', showIf: d => d.falouPrecoQuandoPerguntado === 'Não' },
    { field: 'criouOportunidades', label: 'Criou oportunidades? A consultora observa atentamente os detalhes físicos do cliente, para indicar nossos produtos e trazer soluções?', hint: 'Ex.: cabelo grisalho → linha Match Juventude dos Fios; pele oleosa/linhas de expressão/acne → Botik; pele madura → benefício do óleo de quinoa (firmeza da pele); cliente maquiada → experimentar item de MKB.', tipo: 'escolha', opcoes: SIMNAO },
    { field: 'oportunidadesMelhorar', label: 'Qual consultor(a) não soube identificar e o que você entende que ainda precisa ser melhorado em relação a este ponto?', tipo: 'texto', showIf: d => d.criouOportunidades === 'Não' },
    { field: 'aproveitouAcompanhante', label: 'Após criar desejo de compra no cliente, o(a) consultor(a) aproveitou a pessoa que está acompanhando ele e iniciou o desejo de compra? Perguntou se precisava presentear alguém?', tipo: 'escolha', opcoes: SIMNAO },
    { field: 'acompanhanteMelhorar', label: 'Qual consultor(a) não soube identificar essa oportunidade e o que você entende que ainda precisa ser melhorado em relação a este ponto?', tipo: 'texto', showIf: d => d.aproveitouAcompanhante === 'Não' },
    { field: 'experimentarPremium', label: 'Fez o cliente experimentar os produtos premium da loja? Fez o cliente experimentar os produtos obrigatórios definidos pelo gerente?', tipo: 'escolha', opcoes: SIMNAO },
    { field: 'premiumMelhorar', label: 'Qual consultor(a) não conseguiu e o que você entende que ainda precisa ser melhorado em relação a este ponto?', tipo: 'texto', showIf: d => d.experimentarPremium === 'Não' },
    { field: 'usouPreVenda', label: 'Usou a pré-venda? Separou tudo que o cliente gostou, e não somente o que queria levar?', tipo: 'escolha', opcoes: SIMNAO },
    { field: 'preVendaMelhorar', label: 'Qual consultor(a) não conseguiu e o que você entende que ainda precisa ser melhorado em relação a este ponto?', tipo: 'texto', showIf: d => d.usouPreVenda === 'Não' },
    { field: 'apresentouAlavancas', label: 'A consultora(o) apresentou com experimentação as alavancas de vendas BT e BP durante o atendimento e não no final?', tipo: 'escolha', opcoes: SIMNAO },
    { field: 'alavancasMelhorar', label: 'Qual consultor(a) não apresentou a experimentação e o que você entende que ainda precisa ser melhorado em relação a este ponto?', tipo: 'texto', showIf: d => d.apresentouAlavancas === 'Não' },
    { field: 'organizouCaixaPresente', label: 'Quando for presente, a consultora(o) teve a iniciativa de organizar os produtos na caixa de presente? Informou o valor do presente com o adicional da caixa? E incluiu o cartão presente?', tipo: 'escolha', opcoes: SIMNAO },
    { field: 'caixaPresenteMelhorar', label: 'Qual consultor(a) não teve essa iniciativa e o que você entende que ainda precisa ser melhorado em relação a este ponto?', tipo: 'texto', showIf: d => d.organizouCaixaPresente === 'Não' },
    { field: 'ofereceuAcessoriosMake', label: 'O(a) Consultor(a) na venda de make, ofereceu os acessórios de make? (pincel, nécessaire, esponja)', tipo: 'escolha', opcoes: SIMNAO },
    { field: 'acessoriosMelhorar', label: 'Qual consultor(a) não teve essa iniciativa e o que você entende que ainda precisa ser melhorado em relação a este ponto?', tipo: 'texto', showIf: d => d.ofereceuAcessoriosMake === 'Não' },
    { field: 'destacouDescontos', label: 'O(a) Consultor(a) destacou a vantagem dos descontos que adquiriu na compra?', tipo: 'escolha', opcoes: SIMNAO },
    { field: 'descontosMelhorar', label: 'Qual consultor(a) não teve essa iniciativa e o que você entende que ainda precisa ser melhorado em relação a este ponto?', tipo: 'texto', showIf: d => d.destacouDescontos === 'Não' },
    { field: 'mostrouConfianca', label: 'Quando for presente, além de elogiar a escolha, mostrou confiança no produto vendido?', hint: 'Ex.: "Excelente escolha, tenho certeza que você irá surpreender neste presente." NUNCA usar a frase "boa sorte, qualquer coisa pode trocar!" — falar de troca somente se o cliente perguntar.', tipo: 'escolha', opcoes: SIMNAO },
    { field: 'confiancaMelhorar', label: 'Qual consultor(a) não teve essa iniciativa e o que você entende que ainda precisa ser melhorado em relação a este ponto?', tipo: 'texto', showIf: d => d.mostrouConfianca === 'Não' }
  ];

  const PERGUNTAS_PESQUISAS = [
    { field: 'notaClimaEngajamento', label: 'Avaliando o clima, engajamento e apresentação pessoal, de 0 a 10, que nota você atribui para o time?', tipo: 'escala10' },
    { field: 'notaBotileza', label: 'Avaliando a Botileza, de 0 a 10, que nota você atribui para o time?', tipo: 'escala10' },
    { field: 'notaAtendimento360', label: 'Avaliando o atendimento 360, de 0 a 10, que nota você atribui para o time?', tipo: 'escala10' },
    { field: 'notaGeral', label: 'Avaliando em um contexto geral da visita, de 0 a 10, que nota você atribui para o time?', tipo: 'escala10', opcional: true }
  ];

  function stepDef(n, d) {
    if (n === 1) return { titulo: 'Informações Principais', desc: 'Preencha os dados essenciais da loja que será avaliada nesta visita.', perguntas: perguntasPrincipais(d) };
    if (n === 2) return { titulo: 'Informações sobre a Equipe - Atitudes e Comportamento', desc: 'Avalie a postura da equipe em relação ao atendimento ao cliente, colaboração entre colegas e alinhamento com os valores da empresa.', perguntas: PERGUNTAS_EQUIPE };
    if (n === 3) return { titulo: 'Botileza', desc: 'A Botileza representa a essência do atendimento encantador d’O Boticário: simpatia, atenção genuína, postura acolhedora e cuidado com os detalhes.', perguntas: PERGUNTAS_BOTILEZA };
    if (n === 4) return { titulo: 'Técnicas de Vendas 360', desc: 'Avalie a postura do colaborador quanto à aplicação de técnicas de vendas consultivas.', perguntas: PERGUNTAS_VENDAS360 };
    return { titulo: 'Pesquisas de Avaliação', desc: 'Atribua notas de 0 a 10 para os pilares avaliados durante a visita.', perguntas: PERGUNTAS_PESQUISAS };
  }
  const TOTAL_STEPS = 5;

  // ================================================================
  // Renderizador/coletor/validador genéricos de pergunta — evita repetir
  // o HTML de campo pergunta a pergunta (são quase 60 no total).
  // ================================================================
  function renderPergunta(p, d, dis) {
    const val = d[p.field];
    if (p.tipo === 'escolha') {
      return `<div class="field${p.tipo === 'escolha' && (p.opcoes || []).length > 6 ? '' : ''}">
        <label>${U.escapeHtml(p.label)} <span class="req">*</span></label>
        ${p.hint ? `<p class="sub" style="color:var(--muted);font-size:11px;margin:2px 0 6px">${U.escapeHtml(p.hint)}</p>` : ''}
        <select data-field="${p.field}" ${dis}>${selOpts(p.opcoes, val)}</select>
      </div>`;
    }
    if (p.tipo === 'data') {
      return `<div class="field"><label>${U.escapeHtml(p.label)} <span class="req">*</span></label><input type="date" data-field="${p.field}" value="${val || ''}" ${dis}></div>`;
    }
    if (p.tipo === 'texto') {
      return `<div class="field full">
        <label>${U.escapeHtml(p.label)} <span class="req">*</span></label>
        ${p.hint ? `<p class="sub" style="color:var(--muted);font-size:11px;margin:2px 0 6px">${U.escapeHtml(p.hint)}</p>` : ''}
        <input data-field="${p.field}" value="${U.escapeHtml(val || '')}" ${dis}>
      </div>`;
    }
    if (p.tipo === 'escala10') {
      const opts = Array.from({ length: 11 }, (_, i) => i);
      return `<div class="field full">
        <label>${U.escapeHtml(p.label)} ${p.opcional ? '<span class="hint">(opcional)</span>' : '<span class="req">*</span>'}</label>
        <div data-field="${p.field}" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
          ${opts.map(n => `<label style="display:flex;flex-direction:column;align-items:center;gap:3px;font-size:12px;cursor:pointer;width:30px;padding:4px 0;border-radius:6px;background:${Number(val) === n ? 'var(--p1)' : 'var(--bg)'};color:${Number(val) === n ? '#fff' : 'inherit'}"><input type="radio" name="vl_${p.field}" value="${n}" ${Number(val) === n ? 'checked' : ''} style="margin:0" ${dis}>${n}</label>`).join('')}
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted);margin-top:3px;max-width:400px"><span>Muito Ruim</span><span>Excelente</span></div>
      </div>`;
    }
    return '';
  }

  function wirePerguntas(container, d, onBranchChange) {
    container.querySelectorAll('[data-field]').forEach(inp => {
      if (inp.tagName === 'SELECT') inp.addEventListener('change', () => { d[inp.dataset.field] = inp.value; onBranchChange(); });
      else if (inp.tagName === 'INPUT') inp.addEventListener('input', () => { d[inp.dataset.field] = inp.value; });
    });
    container.querySelectorAll('input[type=radio][name^="vl_"]').forEach(r => {
      r.addEventListener('change', () => {
        const wrap = r.closest('[data-field]');
        d[wrap.dataset.field] = Number(r.value);
        // Re-renderiza só pra atualizar o destaque visual da nota escolhida
        // (não afeta ramificação — nenhuma pergunta depende de uma nota).
        onBranchChange();
      });
    });
  }

  function validarPerguntas(perguntas, d) {
    for (const p of perguntas) {
      if (p.showIf && !p.showIf(d)) continue;
      if (p.opcional) continue;
      const v = d[p.field];
      if (p.tipo === 'escala10') { if (v === undefined || v === null || v === '') return p.label; }
      else if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return p.label;
    }
    return null;
  }

  // ================================================================
  // Estado do módulo
  // ================================================================
  let listState = { search: '' };
  let view = 'list'; // 'list' | 'nova' | 'ver'
  let rootEl = null;
  let vlStep = 1;
  let vlDados = {};
  let viewingId = null;

  function renderVisitaLoja(el, f) {
    rootEl = el;
    render();
  }
  function render() {
    if (!rootEl) return;
    if (view === 'nova') renderNovaVisitaView(rootEl);
    else if (view === 'ver') renderVerView(rootEl);
    else renderListView(rootEl);
  }
  async function reloadAndRender() {
    try { await R.reload(); } catch (err) { /* mantém dados antigos na tela mesmo se o reload falhar */ }
    render();
  }

  // ================================================================
  // LISTA + painel de indicadores
  // ================================================================
  function media(arr, campo) {
    const vals = arr.map(v => v[campo]).filter(v => v !== null && v !== undefined && v !== '');
    if (!vals.length) return null;
    return vals.reduce((s, v) => s + Number(v), 0) / vals.length;
  }

  function filtrarVisitas() {
    let res = (D()['visitas_loja'] || []).slice();
    const s = listState.search.toLowerCase().trim();
    if (s) res = res.filter(v => Object.values(v).some(x => String(x || '').toLowerCase().includes(s)));
    res.sort((a, b) => (b.dataVisita || '').localeCompare(a.dataVisita || ''));
    return res;
  }

  function renderListView(el) {
    const all = D()['visitas_loja'] || [];
    const total = all.length;
    const comAusencia = all.filter(v => v.todosPresentes === 'Não').length;
    const lista = filtrarVisitas();

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div><h2 style="font-size:16px">Visita em Loja</h2><p class="sub" style="color:var(--muted);font-size:12px;margin-top:2px">Avaliações de visita em loja registradas pelos(as) multiplicadores(as)/treinadores(as)</p></div>
        ${canWrite() ? '<button class="btn btn-primary btn-sm" id="vl-novo">+ Nova Visita</button>' : ''}
      </div>
      <div class="kpi-grid">
        ${HUB_UI.kpi('Visitas registradas', U.fmtInt(total), '', 'var(--p1)')}
        ${HUB_UI.kpi('Com ausência de colaborador', U.fmtInt(comAusencia), '', comAusencia > 0 ? 'var(--warning)' : '#1baf7a')}
        ${HUB_UI.kpi('Nota média — Clima/Engajamento', (() => { const m = media(all, 'notaClimaEngajamento'); return m !== null ? U.fmt1(m) : '—'; })(), 'de 0 a 10', 'var(--p2)')}
        ${HUB_UI.kpi('Nota média — Botileza', (() => { const m = media(all, 'notaBotileza'); return m !== null ? U.fmt1(m) : '—'; })(), 'de 0 a 10', '#e87ba4')}
        ${HUB_UI.kpi('Nota média — Atendimento 360', (() => { const m = media(all, 'notaAtendimento360'); return m !== null ? U.fmt1(m) : '—'; })(), 'de 0 a 10', '#4a3aa7')}
        ${HUB_UI.kpi('Nota média — Geral', (() => { const m = media(all, 'notaGeral'); return m !== null ? U.fmt1(m) : '—'; })(), 'de 0 a 10', '#1baf7a')}
      </div>
      <div class="card full">
        <div class="toolbar">
          <input type="text" id="vl-search" placeholder="Buscar por área, loja..." value="${U.escapeHtml(listState.search)}">
        </div>
        ${lista.length === 0 ? HUB_UI.empty('Nenhuma visita registrada ainda.', 'Use "+ Nova Visita" para registrar a primeira avaliação.') : `
        <div class="table-wrap"><table class="dt">
          <thead><tr>
            <th>Data</th><th>Área</th><th>Loja</th><th>Todos presentes?</th>
            <th>Nota Clima</th><th>Nota Botileza</th><th>Nota Atend. 360</th><th>Nota Geral</th>
            <th>Preenchido por</th><th></th>
          </tr></thead>
          <tbody>
            ${lista.map(v => `<tr>
              <td>${v.dataVisita ? U.fmtDateBR(v.dataVisita) : '—'}</td>
              <td>${U.escapeHtml(v.area || '—')}</td>
              <td>${U.escapeHtml(v.loja || '—')}</td>
              <td>${v.todosPresentes === 'Não' ? '<span class="badge b3">Não</span>' : '<span class="badge b2">Sim</span>'}</td>
              <td>${v.notaClimaEngajamento ?? '—'}</td>
              <td>${v.notaBotileza ?? '—'}</td>
              <td>${v.notaAtendimento360 ?? '—'}</td>
              <td>${v.notaGeral ?? '—'}</td>
              <td>${U.escapeHtml(v.criadoPor || '—')}</td>
              <td class="row-actions"><button class="btn btn-outline btn-sm" data-ver="${v.id}">Ver</button></td>
            </tr>`).join('')}
          </tbody>
        </table></div>`}
      </div>`;

    el.querySelector('#vl-search').addEventListener('input', e => { listState.search = e.target.value; renderListView(el); });
    const btnNovo = el.querySelector('#vl-novo');
    btnNovo && btnNovo.addEventListener('click', novaVisita);
    el.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => abrirVer(b.dataset.ver)));
    U.wireTableTopScroll(el);
  }

  // ================================================================
  // NOVA VISITA (wizard de 5 passos — um por seção do formulário original)
  // ================================================================
  function novaVisita() {
    vlStep = 1;
    vlDados = { dataVisita: U.todayISO() };
    view = 'nova';
    render();
  }

  function renderStepperUI(el) {
    const labels = ['Principais', 'Equipe', 'Botileza', 'Vendas 360', 'Pesquisas'];
    el.querySelector('#vl-stepper').innerHTML = labels.map((label, i) => {
      const n = i + 1;
      let cls = '';
      if (n < vlStep) cls = 'done'; if (n === vlStep) cls = 'active';
      return `<div class="step ${cls}"><div class="dot">${n < vlStep ? '✓' : n}</div><div class="lbl">${label}</div></div>${i < labels.length - 1 ? '<div class="line"></div>' : ''}`;
    }).join('');
  }

  function renderNovaVisitaView(el) {
    const d = vlDados;
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div><h2 style="font-size:16px">Nova Visita em Loja</h2><p class="sub" style="color:var(--muted);font-size:12px;margin-top:2px">Preencha os dados em 5 etapas para registrar a visita</p></div>
        <button class="btn btn-outline btn-sm" id="vl-cancelar">Cancelar</button>
      </div>
      <div class="card full">
        <div class="stepper" id="vl-stepper"></div>
        <div id="vl-step-container" class="form-grid"></div>
        <div style="display:flex;justify-content:flex-end;margin-top:20px">
          <div style="display:flex;gap:10px">
            <button class="btn btn-outline" id="vl-voltar" style="width:auto;display:none">Voltar</button>
            <button class="btn btn-primary" id="vl-avancar" style="width:auto">Avançar</button>
          </div>
        </div>
        <div class="msg err" id="vl-msg"></div>
      </div>`;
    renderStepperUI(el);
    renderStepBody(el);
    el.querySelector('#vl-cancelar').addEventListener('click', () => { view = 'list'; render(); });
    el.querySelector('#vl-avancar').addEventListener('click', () => avancarVisita(el));
    el.querySelector('#vl-voltar').addEventListener('click', () => { vlStep--; renderStepperUI(el); renderStepBody(el); });
  }

  function renderStepBody(el) {
    const d = vlDados;
    const step = stepDef(vlStep, d);
    const container = el.querySelector('#vl-step-container');
    const visiveis = step.perguntas.filter(p => !p.showIf || p.showIf(d));
    container.innerHTML = `
      <div class="field full" style="margin-bottom:4px">
        <h3 style="font-size:14px">${U.escapeHtml(step.titulo)}</h3>
        <p class="sub" style="color:var(--muted);font-size:12px;margin-top:2px">${U.escapeHtml(step.desc)}</p>
      </div>
      ${visiveis.map(p => renderPergunta(p, d, '')).join('')}`;
    wirePerguntas(container, d, () => renderStepBody(el));
    el.querySelector('#vl-voltar').style.display = vlStep > 1 ? '' : 'none';
    el.querySelector('#vl-avancar').textContent = vlStep === TOTAL_STEPS ? 'Salvar Visita' : 'Avançar';
  }

  function showVlMsg(el, text) {
    const msg = el.querySelector('#vl-msg');
    msg.textContent = text; msg.style.display = 'block';
  }

  async function avancarVisita(el) {
    const d = vlDados;
    const step = stepDef(vlStep, d);
    const msg = el.querySelector('#vl-msg');
    msg.style.display = 'none';
    const faltando = validarPerguntas(step.perguntas, d);
    if (faltando) { showVlMsg(el, `Preencha o campo "${faltando}".`); return; }
    if (vlStep < TOTAL_STEPS) {
      vlStep++;
      renderStepperUI(el);
      renderStepBody(el);
      return;
    }
    await salvarVisita(el);
  }

  async function salvarVisita(el) {
    const btn = el.querySelector('#vl-avancar');
    btn.disabled = true; btn.textContent = 'Salvando...';
    try {
      const registro = Object.assign({}, vlDados, {
        id: U.nextCode('VL', (D()['visitas_loja'] || []).map(v => v.id)),
        criadoPor: (HUB_USER && (HUB_USER.nome || HUB_USER.email)) || 'Desconhecido',
        criadoEm: new Date().toISOString()
      });
      await R.insertRow('visitas_loja', registro);
      view = 'list';
      await reloadAndRender();
    } catch (err) {
      showVlMsg(el, 'Erro ao salvar: ' + err.message);
      btn.disabled = false; btn.textContent = 'Salvar Visita';
    }
  }

  // ================================================================
  // VER (somente leitura — mostra todas as respostas de uma visita já
  // registrada, agrupadas pelas mesmas 5 seções do wizard)
  // ================================================================
  function abrirVer(id) {
    viewingId = id;
    view = 'ver';
    render();
  }

  function renderVerView(el) {
    const v = (D()['visitas_loja'] || []).find(x => x.id === viewingId);
    if (!v) { view = 'list'; render(); return; }
    const secoes = [1, 2, 3, 4, 5].map(n => {
      const step = stepDef(n, v);
      const visiveis = step.perguntas.filter(p => !p.showIf || p.showIf(v));
      return `<details class="blk" open>
        <summary>${U.escapeHtml(step.titulo)}</summary>
        <div class="blk-body form-grid">${visiveis.map(p => renderPergunta(p, v, 'disabled')).join('')}</div>
      </details>`;
    }).join('');
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div><h2 style="font-size:16px">Visita em Loja — ${U.escapeHtml(v.loja || v.area || v.id)}</h2><p class="sub" style="color:var(--muted);font-size:12px;margin-top:2px">${v.dataVisita ? U.fmtDateBR(v.dataVisita) : ''} · Preenchido por ${U.escapeHtml(v.criadoPor || '—')}</p></div>
        <button class="btn btn-outline btn-sm" id="vl-voltar-lista">‹ Voltar para a lista</button>
      </div>
      ${secoes}`;
    el.querySelector('#vl-voltar-lista').addEventListener('click', () => { view = 'list'; render(); });
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderVisitaLoja = renderVisitaLoja;
})();
