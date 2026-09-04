# Hub Sfera — guia de publicação

O app é só HTML/CSS/JS estático (sem servidor, sem build). Os dados e o
login ficam num projeto Supabase novo e dedicado a este hub (não reaproveita
o banco do Hub de Indicadores nem o do Sfera Recruiter atuais — os dois
continuam funcionando normalmente, sem risco, enquanto você configura este
aqui). Siga os passos na ordem.

## 1. Criar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) → **New project**.
2. Anote a senha do banco (não é usada pelo app, mas guarde por segurança).
3. Aguarde o projeto terminar de provisionar (~2 min).

## 2. Rodar a migration (cria todas as tabelas, permissões e regras de acesso)

1. No painel do projeto: **SQL Editor → New query**.
2. Abra o arquivo [`supabase-migration.sql`](supabase-migration.sql) deste repositório, cole o conteúdo inteiro e clique **Run**.
3. Isso cria:
   - `profiles` — um registro por usuário do hub, com `perfil` (rótulo), `unidades`/`departamentos` liberados e `permissoes` (mapa de checkboxes granular).
   - As tabelas do módulo **Indicadores** (alimentadas por upload): `colaboradores`, `feedbacks`, `one_on_one`, `celebracoes`, `entrevista_pesquisa`, `entrevista_solicitacao`, `twygo_participantes`, `twygo_usuarios`, `twygo_conteudos`.
   - As tabelas do módulo **Recrutamento** (alimentadas pelas próprias telas do hub, sem upload): `vagas`, `candidatos`, `entrevistas`, `historico`, `solicitacoes`, além das listas mestre `marcas`, `unidades`, `cargos`, `etapas`, `fontes_captacao`, `portais`, `niveis_vaga`, `recrutadores`, `recrutamento_departamentos`.
   - A tabela do módulo **Treinamento e Desenvolvimento**: `onboarding` — um registro é criado automaticamente quando um candidato aprovado (vaga já finalizada) é enviado para onboarding pela tela Candidatos; nunca é criada à mão.
   - Todas as tabelas já saem com Row Level Security configurada, incluindo `has_permission()` (lê o mapa de permissões de cada usuário) e `can_see()` (restringe por unidade/departamento, reaproveitado do Hub de Indicadores).

## 3. Desativar confirmação de e-mail

O Cadastro de Acessos (Administração → Cadastro de Acessos) cria logins
diretamente pelo navegador. Para que a pessoa consiga entrar assim que for
cadastrada, desative a confirmação por e-mail:

1. **Authentication → Providers → Email**.
2. Desmarque **Confirm email**.
3. Salve.

## 4. Criar o primeiro administrador

1. **Authentication → Users → Add user**.
2. Preencha e-mail e senha, marque **Auto Confirm User**, salve.
3. Volte ao **SQL Editor** e rode o comando abaixo, trocando o e-mail pelo
   que você acabou de cadastrar (o bloco de `permissoes` marca literalmente
   todas as chaves do catálogo — mantenha igual à lista de
   [`js/permissions.js`](js/permissions.js) se algum dia adicionar uma nova permissão):

   ```sql
   insert into public.profiles (id, email, nome, perfil, permissoes)
   select id, email, 'Administrador', 'admin', '{
     "indicadores.headcount": true, "indicadores.recrutamento": true,
     "indicadores.rotatividade": true, "indicadores.desligamento": true,
     "indicadores.feedbacks": true, "indicadores.oneonone": true,
     "indicadores.treinamentos": true, "indicadores.celebracoes": true,
     "recrutamento.dashboard": true, "recrutamento.vagas": true,
     "recrutamento.candidatos": true, "recrutamento.agenda": true,
     "recrutamento.banco_talentos": true, "recrutamento.aprovacoes": true,
     "recrutamento.historico": true, "treinamento_dev.onboarding": true,
     "admin.upload": true,
     "admin.cadastros_recrutamento": true, "admin.usuarios": true
   }'::jsonb
   from auth.users
   where email = 'seu-email@sferamultifranquias.com';
   ```

Esse é o único passo manual no banco — os próximos usuários são cadastrados
direto pela tela **Administração → Cadastro de Acessos** do app, já logado
como esse administrador (com um formulário de checkboxes por
módulo/funcionalidade, em vez de escrever JSON à mão).

## 5. Pegar a URL e a chave do projeto

**Project Settings → API**:
- **Project URL**
- **anon public** key (⚠️ nunca a `service_role`, essa não deve aparecer em nenhum lugar do site)

Abra [`js/config.js`](js/config.js) e cole os dois valores:

```js
window.HUB_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJ...'
};
```

## 6. Publicar

Sem build, sem comando — é um site estático. Qualquer hospedagem estática
serve (Netlify, Vercel, GitHub Pages, etc.):

- **Opção rápida (Netlify):** [app.netlify.com/drop](https://app.netlify.com/drop) e arraste a pasta do projeto.
- **Opção com Git (recomendada, permite reenviar mudanças depois):** suba este repositório no GitHub e conecte no provedor escolhido. Build command: (deixe em branco). Publish directory: `.` (raiz).

Depois de publicado, acesse a URL e entre com o e-mail/senha do administrador criado no passo 4.

## 7. Cadastrar acessos e importar os dados de Indicadores

Já logado como administrador:

1. **Administração → Cadastro de Acessos**: crie os logins das pessoas.
   Escolha um preset (Administrador/Gestor/RH) como ponto de partida — ele só
   marca um conjunto padrão de checkboxes, você pode ajustar qualquer um
   individualmente depois. Marque as unidades/departamentos liberados se a
   pessoa não deve ver tudo (deixe em branco = vê tudo, dentro do que as
   permissões já liberam).
2. **Administração → Upload de Planilhas**: importe cada planilha no card
   correspondente (Colaboradores, Feedbacks, 1 on 1, Celebrações, Nova
   Entrevista de Desligamento, Twygo). Cada upload **substitui** os dados
   daquela planilha — pode reenviar quantas vezes quiser, sempre com o mesmo
   modelo de colunas (a ordem das colunas não importa, só os nomes dos
   cabeçalhos). **Não existe upload de "Vagas"** — o indicador de
   Recrutamento é lido automaticamente das telas do próprio módulo
   Recrutamento (Controle de Vagas, Candidatos, Agenda), sem nenhum passo manual.
3. **Administração → Cadastros do Recrutamento**: cadastre as listas mestre
   usadas pelas telas de Recrutamento (marcas, unidades, cargos, etapas,
   fontes de captação, portais, níveis de vaga, recrutadores,
   departamentos) — sem isso os formulários de Nova Vaga/Novo Candidato
   ficam sem opções nos dropdowns.

## 8. Migrar os dados dos dois apps antigos (opcional, passo à parte)

Este projeto Supabase começa vazio — as planilhas de Indicadores você reenvia
pelo passo 7 acima, mas os dados operacionais do Sfera Recruiter atual
(vagas, candidatos, entrevistas, histórico já existentes) não são migrados
automaticamente por este guia. Se quiser trazer esse histórico para o Hub
Sfera, isso precisa de um passo de migração de dados à parte (exportar do
projeto Supabase antigo do Sfera Recruiter e importar neste), e não deve ser
feito sem uma cópia de segurança e sem confirmar com quem administra os dois
sistemas hoje.

## 9. Evitar que o projeto Supabase "durma" (plano gratuito)

O plano gratuito do Supabase pausa o projeto depois de um tempo sem uso — a
primeira requisição depois disso demora enquanto ele "acorda" (pode parecer
que o app travou). Com uso real por várias pessoas, recomenda-se o upgrade
para o plano Pro (**Project Settings → Billing**) antes de colocar o hub em
produção — projetos pagos não pausam por inatividade.

## Manutenção

- Trocar a senha de alguém, o perfil ou as permissões/unidades/departamentos
  liberados: **Administração → Cadastro de Acessos → Editar**.
- Remover o acesso de alguém ao app (sem apagar o login do Supabase): botão
  **Remover** na mesma tela.
- Atualizar os dados de Indicadores: reenvie a planilha correspondente em
  **Administração → Upload de Planilhas**.
- Os dados de Recrutamento (vagas, candidatos, entrevistas) são editados
  direto nas telas do módulo — não há upload nem substituição em lote para
  eles.
