// Testa o módulo Pesquisa de Satisfação: parser da planilha 16 (export do Feedz)
// e do modelo antigo 61 (js/parsers-satisfacao.js), conferência da planilha e motor (js/metrics-satisfacao.js), fora do navegador.
// Roda com: node test/satisfacao.test.js
//
// Dados INVENTADOS (nenhum dado real fica no repositório).
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  OK  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}${detail !== undefined ? ' — ' + detail : ''}`); }
}
const perto = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= (tol || 1e-9);
function run(name, fn) {
  console.log(`\n${name}`);
  try { fn(); } catch (err) { fail++; console.log(`FAIL  erro: ${err.stack}`); }
}

const ctx = { console, Intl, Date };
ctx.window = ctx;
ctx.XLSX = { utils: { sheet_to_json: ws => ws.rows } };   // SheetJS falso: a aba já é a lista de linhas
vm.createContext(ctx);
for (const f of ['js/utils.js', 'js/permissions.js', 'js/parsers.js', 'js/parsers-boletim.js', 'js/parsers-satisfacao.js', 'js/metrics-indicadores.js', 'js/metrics-boletim.js', 'js/metrics-satisfacao.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const PS = ctx.HUB_PARSERS_SATISFACAO;
const M = ctx.HUB_METRICS_SATISFACAO;

const RJ = 'Boticário - Rio de Janeiro';
// Linha da planilha: mesma ordem de colunas da "Base Original" (as três últimas sem título).
function linha(pesquisa, unidade, depto, notas, extras) {
  const r = {
    PESQUISA: pesquisa, Data: '21/09/2026', Colaborador: 'Anônimo', 'Posição na empresa': 'É líder', 'Líder direto': 'Fulana de Tal',
    Grupos: 'N/A', CPF: '', Email: '', 'Tempo de empresa': '13 meses', Unidade: unidade, Departamento: depto,
    'Financeiro - 0 a 10': notas.fin, 'Financeiro - O que melhorar?': (extras || {}).finMelhorar || '', 'Financeiro - Comentários': (extras || {}).finCom || '',
    'COMPRAS - 0 a 10': notas.com, 'COMPRAS - O que melhorar?': '', 'Compras -  Quantas reuniões o time realizou com você este mês?': (extras || {}).reunioes || '', 'Compras - Comentários': '',
    'DHO - 0 a 10': notas.dho == null ? '' : notas.dho, 'DHO - O que melhorar?': '', 'DHO - Comentários': '',
    __EMPTY: notas.sup == null ? '' : notas.sup, __EMPTY_1: (extras || {}).supMelhorar || '', __EMPTY_2: (extras || {}).supCom || ''
  };
  return r;
}
const wb = { SheetNames: ['Planilha1', 'Base Original'], Sheets: {
  Planilha1: { rows: [{ 2025: 'x' }] },
  'Base Original': { rows: [
    linha('ago/26', RJ, 'O Boticário Rodo', { fin: 6, com: 8, dho: null, sup: 7 }),
    linha('ago/26', 'Hering', 'Hering Centro', { fin: 8, com: 9, dho: null, sup: 9 }),
    linha('set/26', RJ, 'O Boticário Rodo', { fin: 10, com: 5, dho: 9, sup: 10 }, { finMelhorar: 'Nada a melhorar,', finCom: '.', reunioes: '1 reunião', supCom: 'Escarlath é ótima' }),
    linha('set/26', RJ, 'O Boticário Centro', { fin: 4, com: 7, dho: 8, sup: 0 }, { finMelhorar: 'Tempo de resposta,Educação e cordialidade,', finCom: 'Demora para responder os e-mails da loja', reunioes: '0 reuniões', supMelhorar: 'Tempo para resolução,' }),
    linha('set/26', 'Hering', 'Hering Centro', { fin: 9, com: 9, dho: 6, sup: 8 }, { finMelhorar: 'Tempo de resposta,', finCom: 'Nada a declarar' }),
    linha('', 'Hering', 'Hering Centro', { fin: 1, com: 1 })
  ] }
} };

const colabs = [
  { grupos: 'gestor.boti, pesquisa.satisfação', situacao: 'Ativo', data_admissao: '2024-01-01' },
  { grupos: 'pesquisa.satisfacao', situacao: 'Ativo', data_admissao: '2026-09-10' },
  { grupos: 'Pesquisa.Satisfação', situacao: 'Desligado', data_admissao: '2024-01-01', ultimo_dia_trabalhado: '2026-09-15' },
  { grupos: 'pesquisa.satisfação', situacao: 'Ativo', data_admissao: '2026-10-02' },
  { grupos: 'escritório', situacao: 'Ativo', data_admissao: '2024-01-01' }
];

// Planilha 16 (aba "Worksheet", títulos do Feedz): DHO e Suprimentos com o texto
// da pergunta; coluna sem título no fim que só repete o comentário.
const PERG = s => `Pergunta: Sobre o setor ${s}, em uma escala de 0 a 10, onde 0 é Muito Insatisfeito e 10 Muito Satisfeito, qual o seu nível de satisfação com o suporte oferecido pela área?`;
const MELH = 'Pergunta: Em quais pontos abaixo você acha que a área deve melhorar?';
const COM = 'Pergunta: Pensando nas suas respostas anteriores, por favor, adicione um comentário/feedback em relação ao suporte fornecido pela área.';
function linha16(pesquisa, depto, n, c) {
  c = c || {};
  return {
    PESQUISA: pesquisa, Data: '05/09/2026', Colaborador: 'Anônimo', 'Posição na empresa': 'É líder', 'Líder direto': 'Fulana de Tal', Grupos: 'N/A', CPF: 'N/A', Email: 'N/A',
    'Tempo de empresa': '10 meses', Unidade: 'Hering', Departamento: depto,
    'Financeiro - 0 a 10': n[0], 'Financeiro - O que melhorar?': c.finM || '', 'Financeiro - Comentários': c.fin || '',
    [PERG('DESENVOLVIMENTO HUMANO ORGANIZACIONAL (DHO)')]: n[1], [MELH]: c.dhoM || '', [COM]: c.dho || '',
    'TI - 0 a 10': n[2], 'TI - O que melhorar?': '', 'TI - Comentários': c.ti || '',
    [PERG('de SUPRIMENTOS INDIRETOS')]: n[3], [MELH + '_1']: '', [COM + '_1']: c.sup || '',
    __EMPTY: c.sup || ''
  };
}
const SUP_JUN = [7, 8, 9, 10, 6];
const wb16 = { SheetNames: ['Planilha2', 'Worksheet'], Sheets: {
  Planilha2: { rows: [{ 'Rótulos de Linha': 'x', 'Contagem de Financeiro - 0 a 10': 3 }] },
  Worksheet: { rows: [].concat(
    // ago/24: Suprimentos é cópia, na mesma ordem, do bloco de jun/26 (erro de colagem)
    SUP_JUN.map((s, i) => linha16('ago/24', 'Hering L' + i, [8, '', 7, s])),
    SUP_JUN.map((s, i) => linha16('jun/26', 'Hering L' + i, [9, 9, 8, s])),
    // jul/26: comentários da coluna TI falam de treinamento (colunas trocadas)
    [0, 1, 2].map(i => linha16('jul/26', 'Hering L' + i, [9, 8, 7, 8], { ti: 'Os treinamentos do Twygo ajudam muito' })),
    // set/26: resposta repetida
    [linha16('set/26', 'Hering A', [10, 9, 8, 7], { fin: 'Pagamentos em dia', dhoM: 'Tempo de resposta,', dho: 'Clima bom', sup: 'Sacolas chegaram' }),
     linha16('set/26', 'Hering A', [10, 9, 8, 7], { fin: 'Pagamentos em dia', dhoM: 'Tempo de resposta,', dho: 'Clima bom', sup: 'Sacolas chegaram' })]
  ) }
} };

let r;
run('Parser da planilha 16 (export do Feedz) e conferência', () => {
  const p = PS.parse(wb16, { colaboradores: colabs });
  check('lê a aba Worksheet (não a tabela dinâmica)', p.resumo.respondentes === 15, p.resumo.respondentes);
  check('áreas pelo título "Pergunta: Sobre o setor ..."', JSON.stringify(M.ordenarAreas(p.resumo.areas)) === JSON.stringify(['Financeiro', 'DHO', 'TI', 'Suprimentos Indiretos']), JSON.stringify(p.resumo.areas));
  check('coluna sem título que repete comentário não vira área', !p.avisos.some(a => /sem título/.test(a)));
  const dho = p.linhas.find(l => l.area === 'DHO' && l.pesquisa === '2026-09-01');
  check('"o que melhorar" e comentário da pergunta genérica, pela posição', dho && dho.melhorar.join() === 'Tempo de resposta' && dho.comentario === 'Clima bom', JSON.stringify(dho));
  check('comentário de Suprimentos (pergunta genérica _1)', p.linhas.some(l => l.area === 'Suprimentos Indiretos' && l.comentario === 'Sacolas chegaram'));
  check('DHO vazio em ago/24 não gera linha', !p.linhas.some(l => l.area === 'DHO' && l.pesquisa === '2024-08-01'));
  check('não guarda CPF/e-mail/líder/tempo de empresa', !/Fulana|10 meses|N\/A/.test(JSON.stringify(p.linhas)));
  check('avisa bloco idêntico (Suprimentos ago/24 = jun/26)', p.conferencia.some(a => /Suprimentos Indiretos em ago\/24 e jun\/26/.test(a)), JSON.stringify(p.conferencia));
  check('avisa coluna trocada (TI fala de T&D em jul/26)', p.conferencia.some(a => /jul\/26/.test(a) && /coluna TI fala de T&D/.test(a)), JSON.stringify(p.conferencia));
  check('avisa resposta repetida em set/26', p.conferencia.some(a => /repetidas/.test(a) && /set\/26 \(1\)/.test(a)), JSON.stringify(p.conferencia));
  check('conferência entra nos avisos do upload', p.conferencia.every(a => p.avisos.includes(a)));
  check('Boletim lê a 16 também', ctx.HUB_PARSERS_BOLETIM.parseSatisfacao(wb16).resumo.respondentes === 15);
});

run('Parser do modelo antigo (61)', () => {
  r = PS.parse(wb, { colaboradores: colabs });
  const areas = r.resumo.areas;
  check('acha as áreas pelo título e a de Suprimentos pelas colunas sem título; Compras dividido', JSON.stringify(M.ordenarAreas(areas)) === JSON.stringify(['Financeiro', 'Compras O Boticário', 'Compras Hering e Levis', 'DHO', 'Suprimentos Indiretos']), JSON.stringify(areas));
  check('avisa sobre as colunas sem título', r.avisos.some(a => /sem título/.test(a) && /Suprimentos Indiretos/.test(a)), JSON.stringify(r.avisos));
  check('ignora a linha sem PESQUISA', r.avisos.some(a => /1 linha/.test(a)) && r.ciclos.reduce((s, c) => s + c.respondentes, 0) === 5);
  check('DHO fora do formulário em ago/26 não gera linha', !r.linhas.some(l => l.area === 'DHO' && l.pesquisa === '2026-08-01'));
  check('uma linha por resposta × área (2×3 + 3×4 = 18)', r.linhas.length === 18, r.linhas.length);
  const fin = r.linhas.find(l => l.area === 'Financeiro' && l.departamento === 'O Boticário Centro');
  check('"O que melhorar?" vira lista', JSON.stringify(fin.melhorar) === JSON.stringify(['Tempo de resposta', 'Educação e cordialidade']), JSON.stringify(fin.melhorar));
  check('comentário guardado', fin.comentario === 'Demora para responder os e-mails da loja');
  check('reuniões de Compras no campo extra', r.linhas.find(l => l.area === 'Compras O Boticário' && l.departamento === 'O Boticário Rodo' && l.pesquisa === '2026-09-01').extra === '1 reunião');
  check('Compras da loja Hering vai para Compras Hering e Levis', r.linhas.filter(l => l.unidade === 'Hering' && /^Compras/.test(l.area)).every(l => l.area === 'Compras Hering e Levis'));
  check('Compras da loja O Boticário vai para Compras O Boticário', r.linhas.filter(l => l.unidade === RJ && /^Compras/.test(l.area)).every(l => l.area === 'Compras O Boticário'));
  check('ciclo set/26 lista as duas Compras', ['Compras O Boticário', 'Compras Hering e Levis'].every(a => r.ciclos.find(c => c.pesquisa === '2026-09-01').areas.includes(a)));
  check('nota 0 de Suprimentos conta (não é vazio)', r.linhas.some(l => l.area === 'Suprimentos Indiretos' && l.nota === 0));
  const txt = JSON.stringify(r.linhas);
  check('não guarda líder direto, tempo de empresa, data nem "Anônimo"', !/Fulana|13 meses|21\/09|Anônimo/.test(txt));
  const set = r.ciclos.find(c => c.pesquisa === '2026-09-01');
  check('ciclo set/26: 3 respondentes e 5 áreas (Compras em duas)', set.respondentes === 3 && set.areas.length === 5, JSON.stringify(set));
  check('aptos no fim de set/26: tag com e sem acento, ativo no fim do mês (2)', set.aptos === 2, set.aptos);
  check('aptos no fim de ago/26: quem saiu em 15/09 ainda conta (2)', r.ciclos.find(c => c.pesquisa === '2026-08-01').aptos === 2);
});

run('Estatísticas', () => {
  const s = M.stats([{ nota: 10 }, { nota: 9 }, { nota: 8 }, { nota: 6 }, { nota: 0, melhorar: ['Tempo de resposta'] }, { nota: null, melhorar: ['Nada a melhorar'] }]);
  check('média só com notas válidas (33/5)', perto(s.media, 6.6), s.media);
  check('NPS = (2 − 2) / 5', perto(s.nps, 0), s.nps);
  check('distribuição 0..10', s.dist[0] === 1 && s.dist[10] === 1 && s.dist[8] === 1);
  check('principal ponto ignora "Nada a melhorar"', s.principal === 'Tempo de resposta');
});

run('Visão geral, variação e recortes', () => {
  const idx = M.indexar(r.linhas);
  const g = M.visaoGeral(idx, '2026-09', r.ciclos);
  const fin = g.areas.find(a => a.area === 'Financeiro');
  check('Financeiro set/26 = (10+4+9)/3', perto(fin.atual.media, 23 / 3), fin.atual.media);
  check('variação contra ago/26 = 23/3 − 7', perto(fin.varNota, 23 / 3 - 7), fin.varNota);
  const dho = g.areas.find(a => a.area === 'DHO');
  check('DHO estreia sem variação', dho.varNota == null && dho.cicloAnterior == null);
  check('participação = 3 ÷ 2 aptos, limitada a 100%', perto(g.participacao, 1) && g.respondentes === 3 && g.aptos === 2);
  check('ranking ordenado pela nota', g.areas.every((a, i) => i === 0 || g.areas[i - 1].atual.media >= a.atual.media));
  const ops = M.porOperacao(r.linhas, '2026-09', 'Financeiro');
  check('por operação: Rodo vai para SG, Centro para RJ, Hering', ops.length === 3 && ops.find(o => o.id === 'boti-sg').s.n === 1 && ops.find(o => o.id === 'boti-rj').s.n === 1 && ops.find(o => o.id === 'hering').s.n === 1, JSON.stringify(ops.map(o => [o.id, o.s.n])));
});

run('Sigilo: recorte por perfil', () => {
  const soFin = M.acessoDe({ perfil: 'gestor', permissoes: { 'indicadores.satisfacao': true }, satisfacao_areas: ['Financeiro'] });
  check('perfil com a permissão e área: módulo sim, completo não', soFin.modulo && !soFin.completo && soFin.areas.join() === 'Financeiro');
  const rec = M.recortar(r.linhas, soFin);
  check('só a área liberada', rec.length && rec.every(l => l.area === 'Financeiro'), rec.length);
  check('sem unidade/departamento', rec.every(l => l.unidade == null && l.departamento == null));
  check('não altera as linhas originais', r.linhas.some(l => l.area === 'Financeiro' && l.unidade));
  check('por operação vazio sem a loja', M.porOperacao(rec, '2026-09', 'Financeiro').length === 0);
  check('comentário sem operação', M.comentarios(rec, '2026-09', 'Financeiro', {}).every(c => c.operacao == null));
  const sem = M.acessoDe({ perfil: 'gestor', permissoes: {}, satisfacao_areas: ['Financeiro'] });
  check('área marcada sem a permissão não abre nada', !sem.modulo && M.recortar(r.linhas, sem).length === 0);
  const rh = M.acessoDe({ perfil: 'rh', permissoes: { 'indicadores.satisfacao': true, 'indicadores.satisfacao_completo': true } });
  check('visão completa: todas as áreas, com loja', rh.completo && M.recortar(r.linhas, rh).length === r.linhas.length);
  check('Administrador: visão completa', M.acessoDe({ perfil: 'admin', permissoes: {} }).completo);
  check('acentos/caixa da área no perfil', M.recortar(r.linhas, { modulo: true, completo: false, areas: ['suprimentos indiretos'] }).length === 5);
});

run('Comentários', () => {
  ['.', 'ok!!', 'Nada a declarar', 'nada a melhorar.', 'Sem comentários', 'nada há declarar', '---', 'n', 'sem objeções'].forEach(t =>
    check(`"${t}" é vazio`, M.comentarioVazio(t)));
  ['Demora para responder os e-mails da loja', 'Escarlath é ótima', 'Precisam melhorar o prazo'].forEach(t =>
    check(`"${t}" tem conteúdo`, !M.comentarioVazio(t)));
  const c = M.comentarios(r.linhas, '2026-09', 'Financeiro', {});
  check('filtra os vazios e ordena pela menor nota', c.length === 1 && c[0].nota === 4, JSON.stringify(c));
  check('"todos" traz os vazios', M.comentarios(r.linhas, '2026-09', 'Financeiro', { todos: true }).length === 3);
  check('busca sem acento', M.comentarios(r.linhas, '2026-09', 'Suprimentos Indiretos', { busca: 'OTIMA' }).length === 1);
});

run('Formatação', () => {
  check('nota com vírgula', M.fmtNota(7.666) === '7,7');
  check('NPS com sinal', M.fmtNps(43.4) === '+43' && M.fmtNps(-12.6) === '−13' && M.fmtNps(0) === '0');
  check('variação', M.fmtVarNota(0.36) === '▲ 0,4' && M.fmtVarNota(-0.3) === '▼ 0,3' && M.fmtVarNota(0.01) === '= 0,0');
  check('rótulo do mês', M.rotuloMes('2026-09-01') === 'set/26' && M.rotuloMesLongo('2026-09') === 'setembro de 2026');
  check('pesquisa avalia o mês anterior', M.mesReferencia('2026-09-01') === '2026-08' && M.mesReferencia('2026-01') === '2025-12', M.mesReferencia('2026-01'));
  check('rótulos do ciclo', M.rotuloCiclo('2026-09') === 'set/26 (ref. ago/26)' && M.rotuloCicloLongo('2026-01') === 'Pesquisa de jan/2026 · avalia dezembro/2025', M.rotuloCicloLongo('2026-01'));
  check('faixas', M.faixa(9).id === 'otimo' && M.faixa(8.95).id === 'bom' && M.faixa(7).id === 'atencao' && M.faixa(6.99).id === 'critico');
});

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
