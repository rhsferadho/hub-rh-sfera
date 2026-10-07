# Pesquisa de Satisfação com o Suporte do Escritório — módulo do Hub

Última atualização: 07/10/2026.

## O que é

Todo mês os gestores das operações avaliam cada área do Escritório. Cada avaliação tem:

- nota de 0 a 10;
- "O que melhorar?", em múltipla escolha: Tempo de resposta, Tempo para resolução, Qualidade da solução, Educação e cordialidade ou Nada a melhorar;
- comentário livre.

Compras tem uma pergunta a mais: "Quantas reuniões o time realizou com você este mês?".

O módulo fica em **Indicadores → Pesquisa de Satisfação** e é a ferramenta das lideranças do Escritório para acompanhar a qualidade da entrega. O Boletim da Liderança continua mostrando às operações só a **participação**, nunca as notas.

## Fonte: planilha 16 (decisão do RH em 07/10/2026)

A fonte oficial é `1 - DHO/2.7 People Analytics/1. Base de Dados/16. Base Pesquisa Feedz.xlsx`, aba **Worksheet**. A planilha 61 **não deve ser usada**; o parser ainda aceita o formato dela (aba "Base Original") só por compatibilidade.

- **Ciclo:** a pesquisa aplicada num mês avalia o **mês anterior**. A de set/26 avalia agosto/26, e as respostas são coletadas entre os dias 1 e 17. O Hub guarda o mês da pesquisa (coluna PESQUISA) e mostra o mês avaliado como "ref.": "set/26 (ref. ago/26)" e "Pesquisa de set/2026 · avalia agosto/2026".
- **Formato:**
  - Uma linha por gestor e por ciclo.
  - Vem anônima: "Anônimo", e CPF e e-mail com "N/A". Mas traz Unidade, Departamento e Líder direto.
  - Em DHO, T&D e Suprimentos Indiretos, o título da coluna é o texto da pergunta no Feedz ("Pergunta: Sobre o setor …, em uma escala de 0 a 10…"). Em seguida vêm as perguntas genéricas de "o que melhorar" e de comentário, que o parser lê pela posição.
- **Compras é dividido em duas áreas** (orientação do RH em 07/10/2026): um time atende O Boticário e outro Hering e Levi's. Como o formulário tem uma pergunta só de Compras, o Hub separa pela operação de quem respondeu, com `areaDaResposta()` em `parsers-boletim.js`:
  - **Compras O Boticário:** lojas O Boticário, VD, Quem disse, Berenice? e, no Escritório, o Comercial O Boticário;
  - **Compras Hering e Levis:** lojas Hering e Levi's e, no Escritório, o Comercial Hering e Levis e a Supervisão Levis;
  - quem não se encaixa em nenhuma das duas fica em "Compras (operação não identificada)", e o upload avisa. Na 16 de 07/10/2026 não havia nenhum caso assim.

  As duas são áreas próprias no módulo, no Cadastro de Acessos e no Boletim. Na pesquisa de set/26: O Boticário 7,8 (43 respostas, NPS +23) e Hering e Levis 8,5 (10 respostas, NPS +60).
- **Coluna extra:** há uma coluna sem título no fim, preenchida em só 23 linhas de set/26, que repete o comentário de Suprimentos. Ela é ignorada.
- **Volume:** em 07/10/2026, eram 1.188 respostas em 26 ciclos (ago/24 → set/26) e 13 áreas.
- **Notas 0 de quem não usa a área:** vêm com comentários como "Não utilizo" ou "Desconheço o setor" e puxam a média para baixo. Sugestão: incluir a opção "Não utilizo" no formulário.
- **NPS:** as abas TESTE_NPS e EXPERIMENTO mostram que o RH já testou o NPS. O módulo mostra a nota média e o NPS.

### Validação da 16 (07/10/2026)

A 16 foi comparada célula a célula com a antiga 61. Para saber qual estava certa, foram usados dois critérios: de que área cada comentário fala, e a coerência entre a nota e o "o que melhorar".

| Ciclo | Problema na 16 | Efeito |
|---|---|---|
| **ago/26** | Blocos de DHO a Suprimentos trocados de coluna. Cada coluna tem as respostas de outra área: DHO ← Jurídico, T&D ← Suprimentos, DP ← DHO, TI ← T&D, Manutenção ← DP, Auditoria ← TI, Administrativo ← Manutenção, Marketing ← Auditoria, Jurídico ← Administrativo, Suprimentos ← Marketing | 10 áreas com nota errada. Exemplos: Manutenção 9,1 (o certo é 7,7) e Administrativo 7,7 (o certo é 9,0) |
| **mar/26** | As 4 últimas respostas estão deslocadas entre as áreas de DHO a Jurídico. A coluna Manutenção traz um elogio ao DP | Manutenção 7,1 (o certo é 6,7) e Administrativo 8,5 (o certo é 8,8) |
| **jan/26** | A resposta de O Boticário Mercadão (14/01) foi substituída pelas notas de outra resposta | Diferença de até 0,1 em 7 áreas |
| **jun/26** | Faltam 10 respostas de 15 e 16/06: Manhumirim, Levis Barra, VD Sorrento Centro, Levis Caxias, Hering Copacabana, Polo 01, Carangola, Levis Rio Sul, Halfeld e Alameda | 39 respondentes em vez de 49 |
| **ago/24** | Suprimentos Indiretos aparece preenchida com uma cópia, na mesma ordem, das 39 respostas de jun/26. A área só passou a existir em jun/26 | Uma área que não existia aparece com nota 8,2 |

Os outros 21 ciclos batem com a 61 em notas, comentários e número de respostas.

**Conferência automática no upload:** a função `validar()`, em `parsers-satisfacao.js`, só avisa, sem corrigir nada. Ela acusa:
- resposta repetida;
- bloco de uma área idêntico ao de outro ciclo;
- comentários de uma coluna que falam de outra área.

Na 16 de 07/10/2026, ela pega os erros de ago/24 e ago/26. Os de mar/26, jan/26 e jun/26 são pequenos demais para uma regra automática. Nos 26 ciclos corretos (a 61), a conferência não deu nenhum alarme falso.

## Sigilo e permissionamento

| Quem | O que vê |
|---|---|
| `indicadores.satisfacao` + áreas marcadas no cadastro (`profiles.satisfacao_areas`) | Só as áreas marcadas, e só o **total** de cada uma: nota, NPS, evolução, distribuição, "O que melhorar?" e comentários, **sem** loja, departamento ou operação de quem respondeu |
| `indicadores.satisfacao_completo` | Todas as áreas, com a matriz operação × área, a nota por operação, a tabela por loja e a operação de cada comentário |
| Perfil Administrador | Tudo (`has_permission`) |

- As duas permissões ficam **fora de todos os presets**. São ligadas pessoa a pessoa em Administração → Cadastro de Acessos. O campo de áreas aparece quando "Pesquisa de Satisfação" está marcada, e a lista de contas mostra "🔒 Satisfação: …".
- **No banco:**
  - `satisfacao_respostas` **não tem policy de leitura**. A leitura é só pela função `satisfacao_dados()` (security definer), que corta as áreas e devolve `unidade` e `departamento` nulos para quem não tem a visão completa.
  - Na visão completa, a função também aplica `can_see`.
  - A coluna `ord` serve só para paginar. Ela segue a ordem ciclo → área → nota → comentário, sem relação com a ordem das respostas na planilha.
- **No navegador:** `HUB_METRICS_SATISFACAO.recortar()` repete a regra para o "Visualizar como", em que a sessão real é a do Administrador.

## Arquivos

| Arquivo | Papel |
|---|---|
| `supabase-satisfacao.sql` | Coluna no perfil, tabelas, função de leitura e funções de gravação (que exigem `admin.upload`) |
| `js/parsers-satisfacao.js` | Lê a 16 e gera uma linha por resposta × área. Conta os gestores aptos: ativos no fim do mês com a tag `pesquisa.satisfação`, a mesma regra do Boletim. Faz a conferência da planilha |
| `js/parsers-boletim.js` | `linhasSatisfacao()` e `colunasSatisfacao()`: acham a aba e as colunas de cada área nos dois formatos de título. São usadas pelo Boletim e pelo módulo |
| `js/dal-satisfacao.js` | Carga sob demanda via `satisfacao_dados()`, paginada, e gravação em lotes |
| `js/metrics-satisfacao.js` | Cálculos: média, NPS, distribuição, "O que melhorar?", variação, recortes, mês de referência e filtro de comentários vazios |
| `js/sections/satisfacao.js` | A tela |
| `test/satisfacao.test.js` | `node test/satisfacao.test.js` (dados inventados) |

O card **16. Pesquisa de Satisfação** do Upload grava as duas coisas: o agregado do Boletim (`satisfacao_suporte`) e o módulo (`satisfacao_respostas` + `satisfacao_ciclo`). Se o módulo falhar (por exemplo, com o SQL ainda não rodado), o Boletim é gravado mesmo assim e só aparece um aviso.

## Indicadores

- **Nota média:** média das notas de 0 a 10 do ciclo. Faixas:
  - ótimo: 9 ou mais;
  - bom: de 8 a 8,9;
  - atenção: de 7 a 7,9;
  - crítico: abaixo de 7.

  As faixas ficam em `FAIXAS`, em `metrics-satisfacao.js`.
- **NPS:** % de notas 9–10 menos % de notas 0–6. Zonas:
  - excelência: 75 ou mais;
  - qualidade: de 50 a 74;
  - aperfeiçoamento: de 0 a 49;
  - crítica: abaixo de 0.
- **Variação:** contra a pesquisa anterior em que a área foi avaliada.
- **Participação:** respondentes da pesquisa ÷ gestores aptos, limitada a 100%. Os aptos são calculados no upload, com as tags do cadastro atual.
- **Participação de todas as lojas e áreas** (quem respondeu, parcial ou não respondeu): card no fim da visão geral, **confidencial, só para o Administrador** (permissão `indicadores.satisfacao_participacao`, fora de todos os presets). Veio do boletim do Escritório em 07/10/2026. As contas são as do motor do Boletim (`calcularMes` do mês da pesquisa): respondentes por loja da planilha 16 e aptos = ativos com a tag pesquisa.satisfação hoje. Os dados por loja são buscados com o Boletim (`HUB_BOLETIM.carregar`), então quem tiver essa permissão também precisa de `indicadores.boletim` (o Administrador tem tudo).
- **"O que melhorar?":** % das avaliações em que o ponto foi marcado. O "principal ponto" ignora "Nada a melhorar".
- **Comentários "vazios"** (".", "ok", "nada a declarar", "sem comentários"...) ficam ocultos por padrão. Uma caixa na tela mostra todos.

**Pesquisa de set/26, que avalia agosto (mesmo resultado na 16 e na 61):**

| Área | Nota |
|---|---|
| Jurídico | 9,2 |
| DP | 9,0 |
| Suprimentos Indiretos | 9,0 |
| Administrativo | 8,8 |
| DHO | 8,5 |
| T&D | 8,5 |
| Auditoria | 8,5 |
| Recrutamento e Seleção | 8,1 |
| TI | 8,0 |
| Compras O Boticário | 7,8 |
| Compras Hering e Levis | 8,5 |
| Financeiro | 7,4 |
| Manutenção | 7,3 |
| Marketing | 7,3 |

Escritório: nota geral 8,3 e NPS +43, com 53 respondentes.

## Pendências e ideias

- [ ] Corrigir na planilha 16 os erros da validação (ago/26, mar/26, jan/26, jun/26 e ago/24).
- [ ] Rodar `supabase-satisfacao.sql` no Supabase **antes** do push na main.
- [ ] Enviar a 16 no card do Upload. A Suprimentos Indiretos também passa a aparecer no Boletim.
- [ ] Liberar no Cadastro de Acessos cada responsável de área, com as áreas dele.
- [ ] Definir se o Boletim do mês M deve usar a pesquisa aplicada em M+1, já que a pesquisa avalia o mês anterior. Hoje ele usa a pesquisa aplicada no próprio mês M.
- [ ] Opção "Não utilizo" no formulário, para tirar os zeros de quem não usa a área.
- [ ] Ideias: plano de ação por área (resposta da área aos comentários), meta de nota por área e exportar o relatório da área em PDF.
