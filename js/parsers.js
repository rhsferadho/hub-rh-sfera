// Leitura e mapeamento das planilhas para o formato das tabelas do Supabase.
//
// Cada planilha do RH tem um "molde" fixo de colunas (o nome da empresa não
// muda), mas a ORDEM das colunas e colunas extras não importam aqui: cada
// campo é lido pelo nome do cabeçalho, normalizado (sem acentuação de caixa,
// sem espaços/quebras de linha duplicados). Reenviar a mesma planilha sempre
// funciona, mesmo que o Twygo troque o nome da aba a cada exportação.
(function () {
  function normHeader(h) {
    return String(h == null ? '' : h)
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function buildIndex(row) {
    const idx = {};
    for (const k of Object.keys(row)) {
      const n = normHeader(k);
      if (!(n in idx)) idx[n] = k;
    }
    return idx;
  }

  function pick(row, idx, candidates) {
    for (const c of candidates) {
      const key = idx[normHeader(c)];
      if (key !== undefined) {
        const v = row[key];
        if (v !== undefined && v !== null) return v;
      }
    }
    return '';
  }

  function str(v) {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  }

  const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

  function num(v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v instanceof Date) {
      // Coluna formatada como horário no Excel (ex.: "Carga horária" como
      // 09:06:28) vem como Date com a data-base do Excel — a diferença em
      // dias desde essa época, ×24, dá a quantidade de horas decimais.
      if (isNaN(v.getTime())) return null;
      return ((v.getTime() - EXCEL_EPOCH_MS) / 86400000) * 24;
    }
    let s = String(v).trim();
    if (s === '') return null;
    const isPct = /%$/.test(s);
    s = s.replace('%', '').replace(/\./g, m => m).trim();
    // números pt-BR usam vírgula decimal; só troca se não houver ponto decimal já
    if (/,\d{1,2}$/.test(s) && !/\.\d/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    if (!isFinite(n)) return null;
    return isPct ? n / 100 : n;
  }

  function intOrNull(v) {
    const n = num(v);
    return n === null ? null : Math.round(n);
  }

  // "Carga horária" no Twygo é formatada como duração (H:MM:SS), e o
  // SheetJS (cellDates:true) converte esse tipo de célula pra um objeto
  // Date com um deslocamento de horário espúrio (bug de conversão de
  // formato de duração customizado — reproduzido consistentemente com a
  // planilha real: célula "0:00:00" virava 1899-12-30T03:06:28Z em vez de
  // 00:00:00Z, inflando a soma em ~42x). O texto formatado que o próprio
  // Excel mostra (via sheet_to_json com raw:false) sempre bate com o valor
  // certo, então essa duração é lida à parte, em modo texto, e convertida
  // pra horas decimais na mão.
  function parseDuracaoTexto(s) {
    if (s === undefined || s === null || s === '') return null;
    const m = String(s).trim().match(/^(\d+):(\d{2}):(\d{2})$/);
    if (!m) return num(s);
    return parseInt(m[1], 10) + parseInt(m[2], 10) / 60 + parseInt(m[3], 10) / 3600;
  }

  function toISODate(v) {
    if (v === undefined || v === null || v === '') return null;
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return null;
      return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())).toISOString().slice(0, 10);
    }
    if (typeof v === 'number') {
      const d = new Date(EXCEL_EPOCH_MS + Math.round(v) * 86400000);
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) {
      let [, mm, dd, yy] = m;
      if (yy.length === 2) yy = (parseInt(yy, 10) < 50 ? '20' : '19') + yy;
      const d = new Date(Date.UTC(+yy, +mm - 1, +dd));
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  function sheetToRows(ws) {
    return XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
  }

  // Escolhe, entre as abas do workbook, a que tem a maior interseção de
  // cabeçalhos esperados — assim funciona mesmo se a aba tiver nome
  // dinâmico (ex: exports do Twygo) ou se houver abas extras/vazias.
  function pickSheet(wb, expectedHeaders, opts) {
    opts = opts || {};
    let best = null;
    let bestScore = -1;
    for (const name of wb.SheetNames) {
      if (opts.preferName && normHeader(name) === normHeader(opts.preferName)) {
        const ws = wb.Sheets[name];
        const rows = sheetToRows(ws);
        if (rows.length) return { name, rows };
      }
    }
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      const rows = sheetToRows(ws);
      if (!rows.length) continue;
      const idx = buildIndex(rows[0]);
      let score = 0;
      for (const h of expectedHeaders) if (idx[normHeader(h)] !== undefined) score++;
      if (score > bestScore) {
        bestScore = score;
        best = { name, rows, score };
      }
    }
    return best;
  }

  function requireSignature(rows, expectedHeaders, minMatches, label) {
    if (!rows || !rows.length) throw new Error(`Não encontrei nenhuma linha de dados no arquivo (esperado: ${label}).`);
    const idx = buildIndex(rows[0]);
    let score = 0;
    for (const h of expectedHeaders) if (idx[normHeader(h)] !== undefined) score++;
    if (score < minMatches) {
      throw new Error(
        `Este arquivo não parece ser a planilha "${label}". ` +
        `Verifique se selecionou o arquivo certo (colunas esperadas não encontradas).`
      );
    }
    return idx;
  }

  // ---------------------------------------------------------------------
  // 1. Colaboradores.xlsx  (aba "Headcount")
  // ---------------------------------------------------------------------
  function parseColaboradores(wb) {
    const sig = ['Nome completo', 'Situação', 'Departamento', 'Unidade', 'Gestor Direto', 'Papel'];
    const picked = pickSheet(wb, sig, { preferName: 'Headcount' });
    if (!picked) throw new Error('Não encontrei dados na planilha de Colaboradores.');
    requireSignature(picked.rows, sig, 4, 'Colaboradores');
    return picked.rows.map(row => {
      const idx = buildIndex(row);
      const g = (...c) => pick(row, idx, c);
      return {
        external_id: str(g('ID')),
        nome: str(g('Nome')),
        nome_completo: str(g('Nome completo')) || str(g('Nome')),
        matricula: str(g('Matrícula')),
        email: str(g('Email')),
        cpf: str(g('CPF')),
        cargo: str(g('Cargo')),
        cargo_visivel: str(g('Cargo visível')),
        unidade: str(g('Unidade')),
        departamento: str(g('Departamento')),
        grupos: str(g('Grupos')),
        papel: str(g('Papel')),
        gestor_direto: str(g('Gestor Direto')),
        gestor_email: str(g('Gestor Direto - E-mail')),
        etnia: str(g('Etnia')),
        sexo: str(g('Sexo')),
        genero: str(g('Gênero')),
        data_nascimento: toISODate(g('Data de Nascimento')),
        data_admissao: toISODate(g('Data Admissão')),
        data_cadastro: toISODate(g('Data de Cadastro')),
        situacao: str(g('Situação')),
        ultimo_acesso: toISODate(g('Último Acesso')),
        origem_cadastro: str(g('Origem do Cadastro')),
        participa_gamificacao: str(g('Participa gamificação')),
        desligamento_tipo: str(g('Desligamento - Tipo')),
        desligamento_motivo: str(g('Desligamento - Motivo')),
        ultimo_dia_trabalhado: toISODate(g('Último dia trabalhado')),
        idioma: str(g('Idioma'))
      };
    }).filter(r => r.nome_completo || r.nome);
  }

  // ---------------------------------------------------------------------
  // 4. Feedbacks.xlsx (aba "Feedbacks")
  // ---------------------------------------------------------------------
  function parseFeedbacks(wb) {
    const sig = ['De', 'Para', 'Para Unidade', 'Para Departamento', 'Feedback', 'Avaliação', 'Data'];
    const picked = pickSheet(wb, sig, { preferName: 'Feedbacks' });
    if (!picked) throw new Error('Não encontrei dados na planilha de Feedbacks.');
    requireSignature(picked.rows, sig, 4, 'Feedbacks');
    return picked.rows.map(row => {
      const idx = buildIndex(row);
      const g = (...c) => pick(row, idx, c);
      return {
        de: str(g('De')),
        para: str(g('Para')),
        unidade: str(g('Para Unidade')),
        departamento: str(g('Para Departamento')),
        cargo: str(g('Cargo')),
        anonimo: str(g('Anônimo')),
        template: str(g('Template')),
        feedback: str(g('Feedback')),
        avaliacao: str(g('Avaliação')),
        data: toISODate(g('Data')),
        data_visualizacao: toISODate(g('Data de visualização do Feedback')),
        respostas: {
          r1: str(g('Resposta 1')), r2: str(g('Resposta 2')), r3: str(g('Resposta 3')),
          r4: str(g('Resposta 4')), r5: str(g('Resposta 5')), r6: str(g('Resposta 6'))
        }
      };
    }).filter(r => r.de || r.para);
  }

  // ---------------------------------------------------------------------
  // 5. 1 on 1.xlsx (aba "Worksheet")
  // ---------------------------------------------------------------------
  function parseOneOnOne(wb) {
    const sig = ['Líder/Participante', 'Liderado/Participante', 'Status', 'Data agendada', 'Relação entre os participantes'];
    const picked = pickSheet(wb, sig, { preferName: 'Worksheet' });
    if (!picked) throw new Error('Não encontrei dados na planilha de 1:1.');
    requireSignature(picked.rows, sig, 3, '1 on 1');
    return picked.rows.map(row => {
      const idx = buildIndex(row);
      const g = (...c) => pick(row, idx, c);
      return {
        lider: str(g('Líder/Participante')),
        lider_email: str(g('E-mail (Líder/Participante)')),
        lider_departamento: str(g('Departamento (Líder/Participante)')),
        lider_papel: str(g('Papel (Líder/Participante)')),
        liderado: str(g('Liderado/Participante')),
        liderado_email: str(g('Email (Líderado/Participante)', 'Email (Liderado/Participante)')),
        liderado_matricula: str(g('Matrícula (Líderado/Participante)', 'Matrícula (Liderado/Participante)')),
        unidade: null,
        departamento: str(g('Departamento (Liderado/Participante)', 'Departamento (Líderado/Participante)')),
        liderado_papel: str(g('Papel (Liderado/Participante)', 'Papel (Líderado/Participante)')),
        relacao: str(g('Relação entre os participantes')),
        categoria: str(g('Categoria')),
        data_agendada: toISODate(g('Data agendada')),
        data_realizada: toISODate(g('Data realizada')),
        status: str(g('Status')),
        topicos_lider: str(g('Tópicos (Líder/Participante)')),
        topicos_liderado: str(g('Tópicos (Liderado/Participante)', 'Tópicos (Líderado/Participante)')),
        anotacoes_lider: str(g('Anotações Privadas (Líder/Participante)')),
        anotacoes_liderado: str(g('Anotações Privadas (Liderado/Participante)', 'Anotações Privadas (Líderado/Participante)')),
        acoes_ativas_lider: str(g('Ações Ativas (Líder/Participante)')),
        acoes_concluidas_lider: str(g('Ações Concluídas (Líder/Participante)')),
        acoes_ativas_liderado: str(g('Ações Ativas (Liderado/Participante)', 'Ações Ativas (Líderado/Participante)')),
        acoes_concluidas_liderado: str(g('Ações Concluídas (Liderado/Participante)', 'Ações Concluídas (Líderado/Participante)'))
      };
    }).filter(r => r.lider || r.liderado);
  }

  // ---------------------------------------------------------------------
  // 20. Celebrações.xlsx (aba "Worksheet" — ignora abas de tabela dinâmica)
  // ---------------------------------------------------------------------
  function parseCelebracoes(wb) {
    const sig = ['Colaborador enviou', 'Colaboradores que receberam', 'Mensagem', 'Quantidade de curtidas', 'Data'];
    const picked = pickSheet(wb, sig, { preferName: 'Worksheet' });
    if (!picked) throw new Error('Não encontrei dados na planilha de Celebrações.');
    requireSignature(picked.rows, sig, 3, 'Celebrações');
    return picked.rows.map(row => {
      const idx = buildIndex(row);
      const g = (...c) => pick(row, idx, c);
      return {
        codigo: str(g('Código')),
        colaborador_enviou: str(g('Colaborador enviou')),
        unidade: str(g('Unidade')),
        departamento: str(g('Departamento')),
        papel: str(g('Papel')),
        cargo_enviou: str(g('Cargo do colaborador que enviou')),
        colaboradores_receberam: str(g('Colaboradores que receberam')),
        cargo_recebeu: str(g('Cargo do colaborador que recebeu')),
        mensagem: str(g('Mensagem')),
        curtidas: intOrNull(g('Quantidade de curtidas')),
        comentarios: intOrNull(g('Quantidade de comentários')),
        data: toISODate(g('Data'))
      };
    }).filter(r => r.colaborador_enviou);
  }

  // ---------------------------------------------------------------------
  // 34. Nova Entrevista de Desligamento.xlsx
  // (duas abas: "Pesquisa de Desligamento" + "Solicitação de Desligamento")
  // ---------------------------------------------------------------------
  function npsFromText(v) {
    const n = num(v);
    if (n === null) return null;
    return Math.max(0, Math.min(10, Math.round(n)));
  }

  function parseEntrevistaPesquisa(rows) {
    return rows.map(row => {
      const idx = buildIndex(row);
      const g = (...c) => pick(row, idx, c);
      const respostas = {};
      for (const k of Object.keys(row)) {
        const v = row[k];
        if (v !== '' && v !== null && v !== undefined) respostas[k] = v;
      }
      return {
        planilha_id: str(g('ID')),
        data_inicio: toISODate(g('Hora de início')),
        data_conclusao: toISODate(g('Hora de conclusão')),
        nome: str(g('Seu nome completo')),
        email: str(g('Seu e-mail')),
        telefone: str(g('Seu telefone com DDD \r\nExemplo: 21-99999-9999', 'Seu telefone com DDD')),
        unidade: str(g('Unidade', 'Sua Unidade de trabalho')),
        departamento: str(g('Departamento')),
        motivo_desligamento: str(g('Motivo do Desligamento', 'Motivo do Desligamento:')),
        submotivo_desligamento: str(g('Submotivo de Desligamento')),
        data_desligamento: toISODate(g('Data do Desligamento')),
        trabalharia_novamente: str(g('Você trabalharia novamente na Sfera Multifranquias?')),
        nps: npsFromText(g('Qual é a probabilidade de você nos recomendar a um amigo ou a um colega?')),
        respostas
      };
    }).filter(r => r.nome || r.planilha_id);
  }

  function parseEntrevistaSolicitacao(rows) {
    return rows.map(row => {
      const idx = buildIndex(row);
      const g = (...c) => pick(row, idx, c);
      return {
        planilha_id: str(g('ID')),
        data_solicitacao: toISODate(g('DATA DA SOLICITAÇÃO')),
        nome_solicitante: str(g('NOME DO SOLICITANTE')),
        nome: str(g('NOME')),
        cargo: str(g('CARGO')),
        unidade: str(g('UNIDADE')),
        departamento: str(g('DEPARTAMENTO OU LOJA')),
        data_admissao: toISODate(g('DATA DE ADMISSÃO')),
        data_demissao: toISODate(g('DATA DA DEMISSÃO')),
        tempo_trabalho: intOrNull(g('TEMPO DE TRABALHO')),
        tipo: str(g('TIPO')),
        tipo_desligamento: str(g('TIPO DO DESLIGAMENTO')),
        motivo_desligamento: str(g('MOTIVO DO DESLIGAMENTO')),
        status_feedz: str(g('STATUS DO DESLIGAMENTO NA FEEDZ')),
        status_entrevista: str(g('STATUS DA ENTREVISTA')),
        observacoes: str(g('OBSERVAÇÕES'))
      };
    }).filter(r => r.nome);
  }

  function parseEntrevistaDesligamento(wb) {
    const sigPesquisa = ['Seu nome completo', 'Motivo do Desligamento', 'Você trabalharia novamente na Sfera Multifranquias?'];
    const sigSolicitacao = ['DATA DA SOLICITAÇÃO', 'NOME', 'UNIDADE', 'STATUS DA ENTREVISTA'];
    const pPesquisa = pickSheet(wb, sigPesquisa, { preferName: 'Pesquisa de Desligamento' });
    const pSolicitacao = pickSheet(wb, sigSolicitacao, { preferName: 'Solicitação de Desligamento' });
    if (!pPesquisa && !pSolicitacao) {
      throw new Error('Não encontrei as abas "Pesquisa de Desligamento" e/ou "Solicitação de Desligamento" no arquivo.');
    }
    const pesquisa = pPesquisa ? parseEntrevistaPesquisa(pPesquisa.rows) : [];
    const solicitacao = (pSolicitacao && pSolicitacao.name !== (pPesquisa && pPesquisa.name))
      ? parseEntrevistaSolicitacao(pSolicitacao.rows)
      : [];
    if (!pesquisa.length && !solicitacao.length) {
      throw new Error('O arquivo não contém linhas reconhecíveis de nenhuma das duas abas esperadas.');
    }
    return { pesquisa, solicitacao };
  }

  // ---------------------------------------------------------------------
  // 27. Twygo.xlsx — participantes/matrículas (nível inscrição)
  // ---------------------------------------------------------------------
  function parseTwygoParticipantes(wb) {
    const sig = ['ID do conteúdo', 'Título do conteúdo', 'Nome completo', 'E-mail', 'Progresso', 'Situação da Inscrição'];
    const picked = pickSheet(wb, sig);
    if (!picked) throw new Error('Não encontrei dados na planilha de participantes do Twygo.');
    requireSignature(picked.rows, sig, 4, 'Twygo - Participantes');
    // Segunda leitura da mesma aba em modo texto formatado, só pra pegar
    // "Carga horária" sem o bug de conversão de data/duração do SheetJS
    // (ver parseDuracaoTexto). Mesma ordem de linhas garantida pelo SheetJS.
    const textRows = XLSX.utils.sheet_to_json(wb.Sheets[picked.name], { defval: '', raw: false });
    return picked.rows.map((row, i) => {
      const idx = buildIndex(row);
      const g = (...c) => pick(row, idx, c);
      const textRow = textRows[i] || {};
      const textIdx = buildIndex(textRow);
      const cargaTexto = pick(textRow, textIdx, ['Carga horária', 'Carga Horária do conteúdo']);
      return {
        content_id: str(g('ID do conteúdo')),
        content_title: str(g('Título do conteúdo')),
        content_type: str(g('Tipo do conteúdo')),
        nome_completo: str(g('Nome completo')),
        email: str(g('E-mail')),
        unidade: str(g('Empresa')),
        departamento: str(g('Área')),
        cargo: str(g('Cargo')),
        data_inscricao: toISODate(g('Data de inscrição')),
        ultimo_acesso: toISODate(g('Último Acesso')),
        situacao_inscricao: str(g('Situação da Inscrição')),
        situacao: str(g('Situação')),
        situacao_ambiente: str(g('Situação no ambiente')),
        progresso: num(g('Progresso')),
        nota: num(g('Nota / Média Geral')),
        frequencia: num(g('Frequência')),
        pontuacao: num(g('Pontuação')),
        carga_horaria: parseDuracaoTexto(cargaTexto),
        emitido_em: toISODate(g('Emitido em'))
      };
    }).filter(r => r.nome_completo || r.email);
  }

  // ---------------------------------------------------------------------
  // 27.1. Twygo usuários.xlsx (nível pessoa)
  // ---------------------------------------------------------------------
  function parseTwygoUsuarios(wb) {
    const sig = ['Nome completo', 'E-mail', 'Pontuação', 'Progresso', 'Situação', 'Registrado em'];
    const picked = pickSheet(wb, sig);
    if (!picked) throw new Error('Não encontrei dados na planilha de usuários do Twygo.');
    requireSignature(picked.rows, sig, 4, 'Twygo - Usuários');
    return picked.rows.map(row => {
      const idx = buildIndex(row);
      const g = (...c) => pick(row, idx, c);
      return {
        twygo_id: str(g('Id')),
        nome_completo: str(g('Nome completo')),
        email: str(g('E-mail')),
        cpf: str(g('CPF')),
        ultimo_acesso: toISODate(g('Último acesso em')),
        perfil: str(g('Perfil')),
        pontuacao: num(g('Pontuação')),
        progresso: num(g('Progresso')),
        situacao: str(g('Situação')),
        registrado_em: toISODate(g('Registrado em')),
        cargo: str(g('Cargo')),
        unidade: str(g('Empresa')),
        departamento: str(g('Área'))
      };
    }).filter(r => r.nome_completo || r.email);
  }

  // ---------------------------------------------------------------------
  // 27.1. Twygo conteúdos.xlsx (nível curso/trilha)
  // ---------------------------------------------------------------------
  function parseTwygoConteudos(wb) {
    const sig = ['Nome', 'Tipo', 'Inscrições', 'Progresso', 'Situação', 'Código do Conteúdo'];
    const picked = pickSheet(wb, sig);
    if (!picked) throw new Error('Não encontrei dados na planilha de conteúdos do Twygo.');
    requireSignature(picked.rows, sig, 3, 'Twygo - Conteúdos');
    return picked.rows.map(row => {
      const idx = buildIndex(row);
      const g = (...c) => pick(row, idx, c);
      return {
        codigo_conteudo: str(g('Código do Conteúdo')),
        tipo: str(g('Tipo')),
        nome: str(g('Nome')),
        situacao: str(g('Situação')),
        inscricoes: intOrNull(g('Incrições', 'Inscrições')),
        carga_horaria: num(g('Carga Horária (Horas)')),
        progresso: num(g('Progresso')),
        categorias: str(g('Categorias')),
        data_inicio: toISODate(g('Data de início')),
        data_termino: toISODate(g('Data de término')),
        criado_em: toISODate(g('Criado em')),
        publicado_em: toISODate(g('Publicado em'))
      };
    }).filter(r => r.nome);
  }

  // ---------------------------------------------------------------------
  // 18. Controle Geral de Vagas.xlsx (aba "CTRL GERAL" — todos os status;
  // as outras abas do arquivo, tipo "CTRL_VAGAS_ABERTAS", são só recortes
  // filtrados dessa mesma base, então nem precisam ser lidas).
  // ---------------------------------------------------------------------
  function parseVagas(wb) {
    const sig = ['DATA DE ABERTURA', 'STATUS DA VAGA', 'CARGO', 'RESPONSÁVEL', 'FONTE', 'SLA'];
    const picked = pickSheet(wb, sig, { preferName: 'CTRL GERAL' });
    if (!picked) throw new Error('Não encontrei dados na planilha de Controle Geral de Vagas.');
    requireSignature(picked.rows, sig, 4, 'Controle Geral de Vagas');
    return picked.rows.map(row => {
      const idx = buildIndex(row);
      const g = (...c) => pick(row, idx, c);
      return {
        data_abertura: toISODate(g('DATA DE ABERTURA')),
        sla_dias: num(g('SLA')),
        sla_previsto_dias: num(g('SLA PREVISTO')),
        status_sla: str(g('Status SLA')),
        motivo_sla: str(g('Motivo SLA')),
        unidade: str(g('MARCA')),
        departamento: str(g('DEPARTAMENTO')),
        solicitante: str(g('SOLICITANTE')),
        cargo: str(g('CARGO')),
        sigilosa: str(g('VAGA SIGILOSA?')),
        tipo_vaga: str(g('TIPO DA VAGA')),
        responsavel: str(g('RESPONSÁVEL')),
        status_vaga: str(g('STATUS DA VAGA')),
        natureza_vaga: str(g('TIPO DA VAGA_1')),
        motivo_aumento_quadro: str(g('MOTIVO AUMENTO DE QUADRO')),
        pessoa_substituida: str(g('PESSOA SUBS.')),
        tipo_recrutamento: str(g('TIPO DE RECRUTAMENTO')),
        etapa_vaga: str(g('ETAPA DA VAGA')),
        dias_congelada: num(g('DIAS CONGELADA')),
        data_congelamento: toISODate(g('DATA DO CONGELAMENTO')),
        data_retorno: toISODate(g('DATA DO RETORNO')),
        data_cancelamento: toISODate(g('DATA DO CANCELAMENTO')),
        finalistas: str(g('FINALISTAS')),
        fit: num(g('%FIT')),
        contratado: str(g('CONTRATADO(A)')),
        data_fechamento: toISODate(g('DATA DE FECHAMENTO')),
        data_inicio: toISODate(g('DATA DE INÍCIO')),
        ultima_divulgacao: toISODate(g('ÚLTIMA DIVULGAÇÃO')),
        fonte: str(g('FONTE')),
        quem_indicou: str(g('QUEM INDICOU'))
      };
    }).filter(r => r.cargo || r.status_vaga);
  }

  // ---------------------------------------------------------------------
  function readWorkbook(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
          resolve(wb);
        } catch (err) {
          reject(new Error('Não consegui ler este arquivo como planilha Excel (.xlsx).'));
        }
      };
      reader.onerror = () => reject(new Error('Falha ao carregar o arquivo.'));
      reader.readAsArrayBuffer(file);
    });
  }

  window.HUB_PARSERS = {
    readWorkbook,
    parseColaboradores,
    parseFeedbacks,
    parseOneOnOne,
    parseCelebracoes,
    parseEntrevistaDesligamento,
    parseTwygoParticipantes,
    parseTwygoUsuarios,
    parseTwygoConteudos,
    parseVagas,
    _internal: { normHeader, toISODate, num, str, intOrNull, parseDuracaoTexto }
  };
})();
