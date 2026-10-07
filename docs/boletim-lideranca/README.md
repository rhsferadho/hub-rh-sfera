# Boletim da Liderança — contexto completo do módulo

Este documento reúne tudo o que foi estudado e decidido para levar o **Boletim da Liderança** para dentro do Hub Sfera. Leia antes de mexer no módulo. Data da última atualização: 06/10/2026.

---

## 1. O que é o boletim

Todo mês o RH (DHO) da Sfera Multifranquias envia, via **Mailchimp**, um "Boletim da Liderança" com os indicadores de Gestão de Pessoas de cada operação. Ele vai para gerentes, supervisores regionais, gerentes de canais e diretorias.

São **7 boletins por mês**, um por operação:

| Operação | Saudação usada no boletim |
|---|---|
| O Boticário RJ | Liderança do O Boticário - Rio de Janeiro |
| O Boticário SG | Liderança do O Boticário - São Gonçalo |
| O Boticário Juiz de Fora | Liderança do O Boticário - Juiz de Fora e Valença |
| O Boticário Interior de MG | Liderança do O Boticário - Interior de Minas e Três Rios |
| O Boticário VD | Liderança do O Boticário VD |
| Hering | Liderança da Hering |
| Levi's | Liderança da Levi's |

O módulo também calcula o **Escritório**, que hoje não tem boletim próprio.

**Seções de cada boletim (edição #020, agosto/2026):**
- Feedbacks
- Celebrações na Feedz
- Termômetro de Humor
- Engajamento na Feedz
- Turnover
- Avaliação de Experiência (AvE 45 e 90 dias)
- Pesquisa de Satisfação com o Suporte do Escritório (só gestores)
- Pesquisa de Engajamento: nota, participação, pilares e eNPS
- Treinamento: Twygo, Unibê e Academia Hering

Cada número vem com a variação em relação ao mês anterior e é seguido de gráficos por loja.

**Numeração das edições:** #020 = agosto/2026, e soma 1 por mês. No código, `edicaoDoMes()` em `js/metrics-boletim.js`.

---

## 2. Como era feito: a planilha `Dados_Boletim.xlsx`

A planilha fica em `SharePoint/Corporativo/#1.06.0.0-RH/Pastas Pessoais/João Lucas/Boletim da Liderança/`. Tem 17 MB e 14 abas:

- **8 abas de dados** carregadas por Power Query a partir das bases em `EXTRANET - #1.06.0.0-RH/1 - DHO/2.7 People Analytics/1. Base de Dados/`:
  - 1. Colaboradores
  - 4. Feedbacks
  - 5. 1 on 1
  - 20. Celebrações
  - 36. Humor
  - AVE 45 E 90 DIAS
  - 61. Pesquisa de Satisfação
  - 33. Pesquisa de Engajamento 2026
- **5 abas de cálculo**, uma por marca: Hering, Levis, Boti VD, Boti e Escritório. Juntas têm 79 tabelas dinâmicas e 84 gráficos.
- **1 aba RESUMO.**

### Problemas encontrados

Estes problemas motivaram a migração e não devem ser repetidos:

1. **Trabalho manual todo mês:** o filtro de ano/mês precisa ser trocado em 79 tabelas dinâmicas.
2. **Cerca de 185 números digitados dentro de colunas de fórmula.** Entre eles:
   - percentuais de turnover que não batem com admissões, demissões e HC da própria linha;
   - variações escritas como conta, como `=4.1-3.8`.
3. **Não havia histórico.** As variações em relação ao mês anterior eram digitadas, e saíram erradas: Levi's e VD com nota de engajamento "▲1,0", quando o real era +0,16 e +0,08.
4. **Totais da marca eram média simples das lojas.** Uma loja de 4 pessoas pesava o mesmo que uma de 28.
5. **Feedback contava feedbacks, não pessoas.** O percentual podia passar de 100%, e havia "1" digitado para limitar.
6. **O NPS (escala 0 a 10) entrava na média da Pesquisa de Engajamento (escala 1 a 5).**
7. **A pesquisa era filtrada por mês do calendário, mas roda em ciclos.** O ciclo de setembro foi de 25/09 a 02/10.
8. **Humor usava a coluna "Media" do Feedz,** que é a média histórica da pessoa, e não a média do mês.
9. **Cruzamentos eram feitos por nome.** Exemplo: 393 celebrações com remetente fora do cadastro, como "Juliana Caldeira" e "Odir Luiz Ferreira Garcez".
10. **Blocos com linhas desalinhadas.** No bloco "Boti RJ" da aba Feedback, a coluna X estava deslocada da Y, e o headcount ia para a loja errada.
11. **A aba Colaboradores carregava o CPF de 3.941 pessoas** sem usar em nenhuma conta.
12. **Boletins publicados com inconsistências:**
    - setas do turnover com lógicas opostas ("▲-2,7" e "▼+7,0");
    - Hering com "#0019" no assunto e "#020" no corpo;
    - erros de digitação recorrentes ("fecho o ciclo", "Porem contou com apenas com", "adesão á", "apenas 1 gestores", "influenciamdo", "Doumont").

---

## 3. O que foi construído no Hub

O projeto é o **`hub-rh-sfera-atual`**: HTML, CSS e JS estático, sem build, com scripts em IIFE que expõem objetos `window.HUB_*`. Usa Supabase para login e dados (com RLS: `has_permission()` e `can_see()`), Chart.js e SheetJS.

### Arquivos novos

| Arquivo | Papel |
|---|---|
| `js/metrics-boletim.js` (`HUB_METRICS_BOLETIM`) | Motor de cálculo. Configuração das operações, mapeamento loja → operação, indicadores, comparação com o mês anterior, status contra a meta e geração dos textos do boletim. Não acessa o banco nem o DOM, então pode ser testado em Node. |
| `js/parsers-boletim.js` (`HUB_PARSERS_BOLETIM`) | Lê as planilhas de Humor, notas da Pesquisa de Engajamento e Pesquisa de Satisfação, e **agrega no navegador**: nenhum nome, CPF ou comentário vai para o banco. |
| `js/dal-boletim.js` (`HUB_BOLETIM`) | Carga sob demanda, com cache e `invalidar()`. Também garante a carga da AvE e da participação da Pesquisa de Engajamento. Grava em lotes por RPC. |
| `js/sections/boletim.js` | A tela, em `HUB_SECTIONS.renderBoletim`. |
| `supabase-boletim.sql` | Tabelas, RLS, RPCs e a permissão. Precisa ser rodado no Supabase. |
| `docs/boletim-lideranca/` | Esta documentação e o prompt para o Claude Code. |

### Arquivos alterados

As mudanças são pequenas e preservam o fim de linha (CRLF ou LF) de cada arquivo:

- **`index.html`:**
  - item de menu `ind-boletim` e `<div id="sec-ind-boletim">`;
  - 4 `<script>` novos;
  - versão de cache trocada de `?v=202609291800` para `?v=202610061200`.
- **`js/app.js`:**
  - título, permissão e renderer da seção;
  - a barra de filtros do topo fica oculta nesta tela, que tem seletor próprio de mês e operação;
  - "Atualizar dados" chama `HUB_BOLETIM.invalidar()`.
- **`js/permissions.js`:** nova permissão `indicadores.boletim`. Entra no preset RH e fica fora do preset Gestor.
- **`js/admin/upload.js`:**
  - novos cards **36. Termômetro de Humor** e **61. Pesquisa de Satisfação**;
  - o card **33** (Pesquisa de Engajamento, upload único da planilha 33) passou a gravar também as notas agregadas, lidas da aba "Respostas". Se as notas falharem, só aparece um aviso e a participação continua sendo gravada.
- **`SETUP.md`:** seção 2.2.1, com o passo a passo e a rotina mensal.

### Tabelas novas (`supabase-boletim.sql`)

| Tabela | Conteúdo | Grava via |
|---|---|---|
| `humor_mensal` | mês × unidade × departamento: registros, soma, pessoas distintas e distribuição de 1 a 5 | `boletim_salvar_humor` |
| `engajamento_notas` | dia × unidade × departamento × dimensão: soma e n; para NPS, também promotores e detratores | `boletim_salvar_eng_notas` |
| `satisfacao_suporte` | pesquisa (mês) × unidade × departamento: respondentes e `areas` (JSON com soma e n por área) | `boletim_salvar_satisfacao` |
| `boletim_entradas` | valores manuais (Unibê, Academia Hering) por mês, operação e loja | `boletim_salvar_entrada` |
| `boletim_fechamento` | foto congelada do mês, por operação (JSON com `ind`, `base` e `lojas`) | `boletim_fechar` e `boletim_reabrir` |

- Todas as RPCs exigem a permissão `admin.upload`.
- A leitura exige `indicadores.boletim` mais `can_see(unidade, departamento)`.
- O SQL também cria policies de leitura extras em `engajamento_pulso`, `engajamento_participacao` e `avaliacao_experiencia_45/90` para quem tem `indicadores.boletim`.
- Dá a permissão a todos os perfis `rh` existentes.

### A tela (Indicadores → Boletim da Liderança)

- **Topo:** seletor de mês, seletor de operação (ou "Visão geral"), situação (Em aberto ou Fechado) e botões **Fechar mês** e **Reabrir**, que exigem `admin.upload`.
- **Aba Indicadores:**
  - na *Visão geral*, uma matriz com as operações nas linhas e os indicadores nas colunas, com fundo pela meta e seta de variação;
  - numa *operação*, cards de indicador com variação colorida, gráficos por loja (cada um com **Baixar imagem**, PNG com fundo branco para o Mailchimp) e tabela por loja.
- **Também na operação (07/10/2026):** AvE em números por loja (respondidas × pendentes; a tabela por gestor avaliador foi retirada a pedido do RH, o motor ainda calcula ave_gestores); a tabela de departamentos sem resposta ou abaixo de 60% na Pesquisa de Engajamento foi para o módulo Indicadores → Pesquisa de Engajamento (07/10/2026); gráfico de participação na Pesquisa de Satisfação (respondentes ÷ aptos, com "3 de 5"). No Escritório, o gráfico é por operação e há a lista de todas as lojas/áreas da empresa (respondeu, parcial, não respondeu). Gráficos de Treinamento ainda serão revistos junto com os dados. Ajustes de 07/10/2026: Pesquisa de Satisfação nas operações em pizza (participação × ausência do total, sem expor lojas); turnover sem as lojas com 0%; celebrações em linha com a meta de 4; gráfico de feedbacks por liderança (liderados de cada gestor direto que receberam feedback dele no mês). Celebrações do boletim em colunas com a meta tracejada. O ritmo semanal das celebrações (lojas × semanas do mês) ficou no módulo Indicadores → Celebrações, não no boletim (usa calcularMes() deste motor, campo cel_semanas).
- **Aba Texto do boletim:** seções prontas, com botões "Copiar" e "Copiar o boletim inteiro".
- **Aba Valores manuais:** Unibê (%) por loja e total, e Academia Hering (pontos).
- **Aba Qualidade dos dados:** avisos (nomes fora do cadastro, fontes faltando, lojas sem operação) e o dicionário com a conta de cada indicador.

---

## 4. Regras de cálculo (fonte da verdade: `js/metrics-boletim.js`)

### Mapeamento loja → operação (`operacaoDe(unidade, departamento)`)

- Unidade começa com `Hering`, `Levis` ou `Escritório` → a operação de mesmo nome.
- `Boticário VD - *` → **VD**.
- `Boticário - Interior de MG` e `Boticário - Três Rios` → **MG/3R**.
- `Boticário - Juiz de Fora` e `Boticário - Valença` → **JF**.
- `Boticário - Rio de Janeiro` → **SG** se o departamento estiver em `LOJAS_SG`; senão, **RJ**.
  - Lojas de SG: Alcântara, Carrefour, Guanabara, Partage, Rodo e São Gonçalo Shop.
- `Quem disse, Berenice?` → **RJ**.
- Áreas de apoio (`Comercial…`, `Supervisão…`, `Logística`) entram no total da operação, mas não nos gráficos por loja.
- **"Comercial O Boticário RJ" entra no RJ.** Isso explica a diferença de 1 resposta da Pesquisa de Satisfação entre RJ e SG em relação ao boletim publicado.
- Fontes que só têm departamento (1:1, Twygo) usam a operação da pessoa, buscada no cadastro, ou do departamento quando o nome é único.

### Indicadores

| Indicador | Conta | Meta / leitura |
|---|---|---|
| Adesão aos feedbacks | liderados (papel Colaborador) que receberam ≥ 1 feedback de **gestor** no mês ÷ liderados ativos no fim do mês | meta 100% |
| Feedback ou 1:1 (Escritório) | liderados com feedback **ou** 1:1 realizado ÷ liderados. O Escritório também mostra a adesão só ao 1 on 1 (liderados com 1:1 realizado ÷ liderados) | meta 100% |
| Celebrações | celebrações do **gestor para o próprio time** no mês: remetente com papel Gestor e algum destinatário liderado direto dele (`gestor_direto`), da mesma loja ou `@todos`. Cada celebração conta uma vez (o export repete a linha por destinatário, com o mesmo `codigo`). O usuário automático de aniversários "Juliana Caldeira" (cópia da Juliana Caldeira de Oliveira) não conta | referência de 4 por loja no mês |
| Termômetro de Humor | soma das notas ÷ registros do mês (1 a 5) | > 3,5 (NR-1); ≥ 4,5 "Muito feliz"; ≥ 4 "Feliz"; ≥ 3 "Neutro" |
| Engajamento na Feedz | **média dos 4 módulos do Painel de Engajamento da Feedz** (regra confirmada pelo RH em 07/10/2026), cada um até 100% e com base nos colaboradores ativos: acessos (% que acessou — digitado por loja em Valores manuais, do painel da Feedz com Colaboradores = Ativos); feedbacks enviados por qualquer pessoa da loja ÷ ativos (Escritório: 1:1 realizados ÷ ativos); celebrações enviadas pela loja inteira ÷ ativos; registros de humor ÷ (10 × ativos). Também entram (pedido do RH, 07/10/2026) a participação na Pesquisa de Engajamento (respondentes ÷ convidados do pulso), na Pesquisa de Satisfação (respondentes ÷ gestores aptos) e na AvE do mês ((gestor + autoavaliação concluídas) ÷ (2 × vencidas)). Módulo que não se aplica à loja no mês fica fora da média; loja sem acessos marcada com * | meta 100% |
| Turnover | ((admissões + desligamentos) ÷ 2) ÷ **HC no início do mês** — mesma conta da tela Rotatividade | ≤ 3% ok; ≤ 6% atenção |
| AvE 45 / 90 | quem **vence** o ciclo no mês (admissão + 44 ou + 89 dias): % com avaliação do gestor e % com autoavaliação concluídas. Quem saiu antes do vencimento não entra | meta 100% |
| Pesquisa de Satisfação | gestores que responderam (PESQUISA = mês) ÷ gestores ativos com a tag `pesquisa.satisfação` (coluna Grupos do cadastro); notas de 0 a 10 por área. **No boletim do Escritório entram as respostas da empresa toda** (é o Escritório que está sendo avaliado) | — |
| Nota da Pesquisa de Engajamento | média das respostas do **pulso** que começa no mês, **sem a pergunta de NPS**; pilares = média por dimensão | ≥ 4,0 meta; ≥ 3,5 saudável |
| Participação na Pesquisa | respondentes ÷ convidados do pulso, das tabelas `engajamento_*` que o Hub já tinha | meta 60% |
| eNPS | % de promotores (9-10) − % de detratores (0-6) | — |
| Twygo | progresso médio das inscrições confirmadas com ambiente ativo. **É a foto atual, não muda com o mês** | 90% |
| Unibê / Academia Hering | entrada manual | — |

### Regras gerais

- **Totais da operação são ponderados:** soma dos numeradores ÷ soma dos denominadores. Nunca média simples das lojas.
- **Anonimato:** a nota da pesquisa por loja só aparece com 3 ou mais respondentes (`MIN_RESPOSTAS_NOTA`). O eNPS só aparece no total da operação.
- **Setas:** ▲ subiu, ▼ caiu, = estável. A cor indica se foi bom (verde) ou ruim (vermelho); no turnover, cair é bom. Percentuais variam em p.p.
- **Comparação com o mês anterior:** usa o boletim **fechado** (`boletim_fechamento`) quando existe; senão, recalcula com os dados atuais.
- **Componente "acessos" do engajamento:** vem de `colaboradores.ultimo_acesso`, que é uma foto do dia do upload. Por isso só é calculado no mês da foto (pela data de `updated_at`). Nos outros meses, o engajamento usa 3 componentes, e por isso existe o "Fechar mês".

---

## 5. Validação feita (agosto/2026, com os dados da planilha)

O motor foi executado em Node com as abas da `Dados_Boletim.xlsx` e comparado com os 7 boletins #020 publicados:

| Operação | Feedback (boletim / Hub) | Humor | Satisfação | Nota pesquisa | eNPS |
|---|---|---|---|---|---|
| RJ | 30% / 18% | 3,4 / 3,5 | 8 / 9 | 3,9 / 3,4 | −100 / −100 ✅ |
| SG | 23% / 22% | 4,5 / 4,5 ✅ | 4 / 3 | 3,7 / 3,6 | 0 / 0 ✅ |
| JF | 48% / 43% | 4,1 / 4,5 | 5 / 5 ✅ | 4,3 / 4,2 | — / — |
| MG/3R | 57% / 50% | 3,7 / 4,4 | 14 / 14 ✅ | 4,1 / 4,2 | 0 / 0 ✅ |
| VD | 32% / 30% | 3,8 / 4,2 | 8 / 8 ✅ | 3,8 / 3,8 ✅ | −10 / −10 ✅ |
| Hering | 42% / 33% | 4,2 / 4,2 ✅ | 1 / 1 ✅ | 3,9 / 3,4 | −50 / −50 ✅ |
| Levi's | 94% / 74% | 4,3 / 4,3 ✅ | 6 / 6 ✅ | 3,9 / 4,0 | 100 / 100 ✅ |

Outras conferências que bateram: as celebrações de SG (▼9) e a variação do humor da Hering (▲0,1), ambas iguais ao boletim.

**Por que algumas diferenças são esperadas:**
- **Feedback:** agora conta pessoas, não feedbacks.
- **Humor de JF, MG e VD:** a planilha usava a média histórica da pessoa.
- **Nota da pesquisa:** a planilha misturava meses e fazia média das lojas.
- **Hering 3,9:** não foi possível reproduzir esse valor da base, que dá 3,44.

**Não validado:**
- **Turnover:** a aba Colaboradores da planilha não tem datas.
- **Participação da pesquisa:** não estava na planilha; no Hub vem do card 33.
- **Twygo por loja.**

**Teste no navegador:** a tela foi testada localmente com um Supabase falso em memória carregado com os dados reais: Visão geral, operação, textos, valores manuais, fechar e reabrir, download de PNG e cards de upload. Nenhum erro de JS.

---

## 6. Decisões tomadas (revisar se necessário)

1. **Notas da Pesquisa de Engajamento são guardadas só agregadas,** por dia, departamento e dimensão. Antes, o Hub guardava só a participação, de propósito. A nota por loja só aparece com 3+ respondentes. Se o RH preferir não guardar notas, basta remover a chamada `importarNotasJunto` em `js/admin/upload.js`.
2. **Permissão `indicadores.boletim`:** preset RH sim, preset Gestor não.
3. **Engajamento na Feedz é calculado pelo Hub com as contas do Painel de Engajamento da Feedz** (07/10/2026): só os Acessos são digitados. Conferência VD Alcântara set/2026 — Feedz: 55 ativos, 42 feedbacks, 7 celebrações, 306 humores; Hub: 56, 39, 9, 295.
4. **Turnover usa o HC do início do mês,** igual à tela Rotatividade. Fórmula informada pelo RH: (admissões + demissões) ÷ 2 ÷ HC.
5. **"Comercial O Boticário RJ" entra no RJ.**
6. **Nomes de arquivo do PNG sem acento,** porque o Chrome ignora o nome quando ele tem caracteres fora do ASCII.
7. **Turnover é calculado pelo Hub** (mesma conta da tela Rotatividade e do BI, confirmada pelo RH em 06/10/2026), não é mais digitado.
8. **Escritório tem boletim próprio** (confirmado em 06/10/2026): seção "Feedbacks e 1 on 1", textos falam em departamento, Pesquisa de Satisfação da empresa toda e sem a seção de Treinamento.
9. **Twygo é foto atual:** só tem seta quando o mês anterior foi fechado (recalcular daria o mesmo número).

---

## 7. Pendências e próximos passos

**Para colocar no ar:**
O módulo foi levado da branch `teste-local` para a branch `boletim-lideranca` (pasta `C:/hubboletim`, criada a partir de `origin/main`, já com o upload único da Pesquisa de Engajamento). É dela que se publica.

- [ ] Rodar `supabase-boletim.sql` no SQL Editor, depois do `supabase-engajamento.sql`.
- [ ] Commit e push da branch na `main`.
- [ ] Subir **36. Humor.xlsx** e **61. Pesquisa de Satisfação.xlsx**, e reenviar a **33** para gravar as notas.
- [ ] Informar o **Engajamento na Feedz** (painel) de cada operação em Valores manuais.
- [ ] Abrir o boletim de setembro/2026 e conferir a aba Qualidade dos dados.
- [ ] Conferir o **turnover** contra a tela Rotatividade (SG: filtrar pelos departamentos de SG, porque divide a unidade com o RJ).

**Melhorias sugeridas:**
- [x] "Juliana Caldeira" é o usuário automático de aniversários: fica fora das celebrações (`USUARIOS_AUTOMATICOS` em `metrics-boletim.js`).
- [ ] **Importar por planilha** o Engajamento do painel da Feedz e os Treinamentos (Twygo/Unibê/Academia Hering), no lugar da digitação. Depois, tentar reproduzir a conta de "Engajados" da Feedz.
- [ ] Confirmar a conta do 1 on 1 do Escritório (boletim #020: 7% ▼2,0; o Hub dá 11% ▼2,6 em agosto).
- [ ] Validar o mapeamento Twygo → loja. Os campos `Empresa` e `Área` do Twygo podem não bater com a unidade e o departamento da Feedz; hoje o motor tenta primeiro pela pessoa (e-mail ou nome).
- [x] Teste automatizado do motor: `node test/boletim.test.js`.
- [x] PESQUISA da planilha 61 vem como texto ("set/26"): o parser lia como 2001. Corrigido (`mesBR` em `parsers-boletim.js`).
- [ ] Exportar o boletim em HTML pronto para o Mailchimp, com textos e gráficos juntos.
- [ ] Automatizar Unibê e Academia Hering, hoje manuais.

---

## 8. Como testar localmente

1. **Teste automatizado:** `node test/boletim.test.js` (sem dependências; dados inventados). Rode a cada mudança no motor ou nos parsers.
2. **Tela com dados reais, sem tocar no Supabase:** em `C:/hubboletim` há um harness fora do git (`_dev-boletim.html` + `_dev/`, listados em `.git/info/exclude`) com um Supabase falso em memória carregado das planilhas da pasta Base de Dados. Servidor: `hub-boletim` no `launch.json` da pasta `hub-sfera` (porta 3013), abrir `/_dev-boletim.html`. O `_dev/dados.js` tem dados pessoais: apague a pasta `_dev` quando terminar.
3. Para testar o motor sem navegador, carregue `utils.js`, `parsers.js`, `parsers-boletim.js` e `metrics-boletim.js` num `vm.createContext` do Node, com `window = contexto`. Preencha:
   - `window.HUB_DATA` (colaboradores, feedbacks, celebracoes, one_on_one, twygo_participantes, engajamento_pulso, engajamento_participacao);
   - `window.HUB_EXPERIENCIA_DATA = {45: [...], 90: [...]}`;
   - `window.HUB_BOLETIM_DATA` (humor_mensal, engajamento_notas, satisfacao_suporte, entradas, fechamentos, versao).

   Depois chame `HUB_METRICS_BOLETIM.boletim('2026-08')` e `HUB_METRICS_BOLETIM.textos(resultado.operacoes['boti-sg'], '2026-08')`.

---

## 9. Cuidados

- **Dados pessoais:** não gravar nome, CPF, e-mail ou comentário nas tabelas do boletim. O padrão é agregar no navegador.
- **Fim de linha:** os arquivos do projeto têm **CRLF ou LF misturados**. Ao editar com script, preserve o fim de linha original para o diff ficar limpo.
- **Versão de cache:** ao alterar qualquer JS, troque a versão `?v=` em `index.html`.
- **Gravação no banco:** sempre por funções `security definer` que checam `has_permission('admin.upload')`. As tabelas não têm policy de escrita direta.
