# Prompt para continuar no Claude Code

Abra o Claude Code na pasta `hub-rh-sfera-atual` e cole o texto abaixo. Ele serve para a primeira sessão; nas próximas, basta dizer "leia docs/boletim-lideranca/README.md e continue pelas pendências".

---

```
Você vai continuar o desenvolvimento do módulo "Boletim da Liderança" do Hub Sfera
(este repositório: HTML/CSS/JS estático, sem build, Supabase, Chart.js, SheetJS).

ANTES DE QUALQUER ALTERAÇÃO:
1. Leia docs/boletim-lideranca/README.md inteiro. Ele tem o contexto do negócio, como o
   boletim era feito (planilha Dados_Boletim.xlsx), os problemas encontrados, as regras de
   cálculo, a validação contra os boletins de agosto/2026, as decisões tomadas e as pendências.
2. Leia os arquivos do módulo: js/metrics-boletim.js (motor de cálculo e textos),
   js/parsers-boletim.js, js/dal-boletim.js, js/sections/boletim.js e supabase-boletim.sql.
3. Leia como o resto do projeto funciona antes de propor mudanças: js/app.js (navegação e
   permissões), js/permissions.js, js/admin/upload.js, js/dal-indicadores.js,
   js/metrics-indicadores.js (rotatividadeMetrics: a conta de turnover tem que continuar
   igual), js/sections/engajamento.js (padrão visual das telas), js/ui-charts.js e SETUP.md.
4. Rode `git status` e `git diff` para ver o que ainda não foi commitado.

REGRAS DO PROJETO (não quebre):
- Scripts em IIFE expondo window.HUB_*; sem ES modules, sem build, sem dependências novas
  além das CDNs já usadas no index.html.
- Ao mudar qualquer JS, atualize a versão ?v= de TODOS os <script> no index.html.
- Os arquivos têm fim de linha CRLF e LF misturados: preserve o do trecho editado (diff limpo).
- Nada de nome, CPF, e-mail ou comentário nas tabelas do boletim: agregue no navegador.
- Escrita no Supabase só por funções security definer que checam has_permission('admin.upload');
  leitura com has_permission('indicadores.boletim') e can_see(unidade, departamento).
- Totais da operação são sempre ponderados (soma dos numeradores ÷ soma dos denominadores).
- Textos do boletim em português correto, no tom dos boletins atuais (ver textos() em
  metrics-boletim.js). Setas: ▲ subiu / ▼ caiu / = estável; a cor diz se foi bom ou ruim.
- Interface e comentários em português, no mesmo estilo dos arquivos existentes.
- Não faça commit nem push sem eu pedir.

PRIMEIRA TAREFA:
Faça um diagnóstico e me apresente um plano (sem alterar arquivos ainda) para:
a) conferir o que falta para colocar o módulo no ar (SQL a rodar, uploads, conferências) e
   gerar uma checklist que eu consiga seguir;
b) levar para dentro do projeto um teste automatizado do motor (test/boletim.test.js, rodando
   com `node`, carregando os scripts num vm.createContext como descrito na seção 8 do README),
   cobrindo: mapeamento loja → operação, ponderação dos totais, feedback por pessoas,
   turnover igual ao da tela Rotatividade, AvE (vencimento = admissão + 44/89), nota sem NPS,
   anonimato (< 3 respondentes), eNPS e as setas/variações;
c) priorizar as "Melhorias sugeridas" da seção 7 do README, dizendo esforço e risco de cada uma.

Depois que eu aprovar o plano, execute um item por vez, rodando o teste a cada mudança.
```

---

## Prompts curtos para tarefas específicas

**Revisar os números de um mês real** (depois de rodar o SQL e subir as planilhas):

```
Abri o Boletim da Liderança de <mês>. Os números de <operação> estão assim: <cole aqui>.
O boletim que publicamos antes dizia: <cole aqui>. Leia docs/boletim-lideranca/README.md
(seções 4 e 5) e explique cada diferença, apontando se é mudança de metodologia ou erro.
Se for erro, proponha a correção em js/metrics-boletim.js com um teste.
```

**Ajustar o texto de uma seção:**

```
Na aba "Texto do boletim", quero mudar a seção <nome>: <o que mudar>. A alteração vale para
todas as operações. Edite só a função textos() em js/metrics-boletim.js, mantendo o português
correto, e me mostre o antes e depois com os dados de agosto/2026.
```

**Adicionar uma loja nova:**

```
Abrimos a loja <nome do departamento na Feedz> na unidade <unidade>. Confira em
operacaoDe() (js/metrics-boletim.js) se ela já cai na operação certa; se for de São Gonçalo,
inclua em LOJAS_SG. Atualize o README (seção 4) e o teste.
```

**Exportar o boletim para o Mailchimp:**

```
Quero um botão na tela do Boletim da Liderança que gere um HTML pronto para colar no
Mailchimp com os textos (textos()) e os gráficos da operação (como imagens embutidas),
na ordem das seções do boletim atual. Antes de implementar, me mostre uma proposta de layout.
```
