// Testa a base de vagas do Fechamento do Período: parser da planilha 18
// (js/parsers-fechamento.js) e regra de SLA/indicadores (js/metrics-fechamento.js),
// fora do navegador. Roda com: node test/fechamento.test.js
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
function run(name, fn) {
  console.log(`\n${name}`);
  try { fn(); } catch (err) { fail++; console.log(`FAIL  erro: ${err.stack}`); }
}

const ctx = { console, Intl, Date };
ctx.window = ctx;
ctx.XLSX = { utils: { sheet_to_json: ws => ws.rows } };   // SheetJS falso: a aba já é a lista de linhas
vm.createContext(ctx);
for (const f of ['js/utils.js', 'js/parsers.js', 'js/parsers-fechamento.js', 'js/metrics-fechamento.js', 'js/fechamento-slides.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const PF = ctx.HUB_PARSERS_FECHAMENTO;
const M = ctx.HUB_METRICS_FECHAMENTO;
const SL = ctx.HUB_FECHAMENTO_SLIDES;

const d = iso => { const [y, m, dd] = iso.split('-').map(Number); return new Date(y, m - 1, dd); };
function vaga(o) {
  return Object.assign({
    'DATA DE ABERTURA': '', SLA: '', 'Status SLA': '', 'Motivo SLA': '', UNIDADE: 'Hering', DEPARTAMENTO: 'Loja Centro',
    SOLICITANTE: 'Fulana Gestora', CARGO: 'Consultor de Vendas', 'VAGA SIGILOSA?': 'Não', 'TIPO DA VAGA': 'Operacional',
    'RESPONSÁVEL': 'Recrutadora A', 'STATUS DA VAGA': 'Finalizada', 'TIPO DA VAGA_1': 'Substituição', 'PESSOA SUBS.': 'Beltrano',
    'TIPO DE RECRUTAMENTO': 'Externo', 'ETAPA DA VAGA': 'Onboarding', 'DIAS CONGELADA': '', 'DATA DO CANCELAMENTO': '',
    '%FIT': '', 'CONTRATADO(A)': 'Ciclano', 'DATA DE FECHAMENTO': '', 'DATA DE INÍCIO': '', FONTE: 'InfoJobs',
    OBSERVAÇÃO: 'Candidata X faltou na entrevista'
  }, o);
}
function wb(rows) {
  return { SheetNames: ['Resumo Abertas', 'CTRL GERAL'], Sheets: { 'Resumo Abertas': { rows: [{ UNIDADE: 'Hering', 'QTDE VAGAS ABERTAS': 3 }] }, 'CTRL GERAL': { rows } } };
}

const BASE = [
  // Loja RJ (Hering) 20 dias: 20 no prazo, 21 fora
  vaga({ 'DATA DE ABERTURA': d('2026-07-01'), 'DATA DE FECHAMENTO': d('2026-07-21') }),
  vaga({ 'DATA DE ABERTURA': d('2026-07-01'), 'DATA DE FECHAMENTO': d('2026-07-22'), 'Status SLA': 'Expirou SLA', FONTE: 'Infojobs' }),
  // VD RJ 25 dias
  vaga({ 'DATA DE ABERTURA': d('2026-07-05'), 'DATA DE FECHAMENTO': d('2026-07-30'), UNIDADE: 'Boticário VD - Rio de Janeiro', FONTE: 'Indeed ' }),
  // Loja MG 34 dias: 30 dias, no prazo (a planilha marcava como expirada)
  vaga({ 'DATA DE ABERTURA': d('2026-07-01'), 'DATA DE FECHAMENTO': d('2026-07-31'), UNIDADE: 'Boticário - Juiz de Fora', 'Status SLA': 'Expirou SLA' }),
  // Estratégica 35 dias: 40 dias, fora; sigilosa
  vaga({ 'DATA DE ABERTURA': d('2026-06-20'), 'DATA DE FECHAMENTO': d('2026-07-30'), 'TIPO DA VAGA': 'Estratégica', UNIDADE: 'Escritório', CARGO: 'Gerente Financeiro', 'VAGA SIGILOSA?': 'Sim', FONTE: 'LinkedIn', '%FIT': 0.85 }),
  // abertas e ativas
  vaga({ 'DATA DE ABERTURA': d('2026-07-10'), 'STATUS DA VAGA': 'Aberta', 'TIPO DA VAGA_1': 'Extra Natal', FONTE: '' }),
  vaga({ 'DATA DE ABERTURA': d('2026-07-12'), 'STATUS DA VAGA': 'Andamento', 'DATA DE FECHAMENTO': d('2026-07-20') }),
  vaga({ 'DATA DE ABERTURA': d('2026-07-15'), 'STATUS DA VAGA': 'Cancelada' }),
  vaga({ 'DATA DE ABERTURA': d('2026-07-16'), 'STATUS DA VAGA': 'Cancelada', 'DATA DO CANCELAMENTO': d('2026-07-25') }),
  // linha vazia do fim da planilha
  vaga({ 'STATUS DA VAGA': '', 'TIPO DA VAGA': '', UNIDADE: '' })
];

run('parse: aba CTRL GERAL, sem nomes de pessoa nem observação', () => {
  const r = PF.parse(wb(BASE));
  check('lê a aba CTRL GERAL', r.aba === 'CTRL GERAL', r.aba);
  check('ignora a linha sem data de abertura', r.linhas.length === 9, r.linhas.length);
  const l = r.linhas[0];
  check('datas em ISO', l.data_abertura === '2026-07-01' && l.data_fechamento === '2026-07-21', l.data_abertura + ' ' + l.data_fechamento);
  check('UNIDADE vira unidade', l.unidade === 'Hering', l.unidade);
  const chaves = Object.keys(l).join(',');
  check('não guarda contratado, substituído, solicitante nem observação', !/contratad|pessoa|solicitante|observa/i.test(chaves), chaves);
  const sig = r.linhas[4];
  check('vaga sigilosa sem cargo', sig.sigilosa === true && sig.cargo === null, JSON.stringify([sig.sigilosa, sig.cargo]));
  check('fonte unificada pela grafia mais usada', r.linhas[1].fonte === 'InfoJobs' && r.linhas[2].fonte === 'Indeed', r.linhas[1].fonte + '|' + r.linhas[2].fonte);
  check('%FIT em 0–1', sig.fit === 0.85, sig.fit);
});

run('parse: conferência da planilha', () => {
  const r = PF.parse(wb(BASE));
  const t = r.avisos.join(' | ');
  check('avisa cancelada sem data de cancelamento', /1 vaga\(s\) Cancelada\(s\) sem DATA DO CANCELAMENTO/.test(t), t);
  check('avisa ativa com data de fechamento', /1 vaga\(s\) Aberta\/Andamento com DATA DE FECHAMENTO/.test(t), t);
});

run('parse: planilha errada', () => {
  let msg = '';
  try { PF.parse({ SheetNames: ['X'], Sheets: { X: { rows: [{ NOME: 'a' }] } } }); } catch (e) { msg = e.message; }
  check('erro explica o que falta', /CTRL GERAL/.test(msg), msg);
});

run('SLA: regra oficial por operação', () => {
  const s = v => M.slaMeta(v);
  check('Loja RJ 20', s({ tipo_vaga: 'Operacional', unidade: 'Boticário - Rio de Janeiro' }) === 20);
  check('VD RJ 25', s({ tipo_vaga: 'Operacional', unidade: 'Boticário VD - Rio de Janeiro' }) === 25);
  check('Loja MG 34', s({ tipo_vaga: 'Operacional', unidade: 'Boticário - Interior de MG' }) === 34);
  check('VD MG 34', s({ tipo_vaga: 'Operacional', unidade: 'Boticário VD - Juiz de Fora' }) === 34);
  check('Estratégica 35 em qualquer operação', s({ tipo_vaga: 'Estratégica', unidade: 'Boticário VD - Interior de MG' }) === 35);
  check('unidade sem regra = null', s({ tipo_vaga: 'Operacional', unidade: 'Loja Nova' }) === null);
});

run('periodo: julho/2026', () => {
  const r = PF.parse(wb(BASE));
  const p = M.periodo(r.linhas, '2026-07-01', '2026-07-31');
  check('5 fechadas (Andamento com data não conta)', p.fechadas === 5, p.fechadas);
  check('8 abertas no mês', p.abertas === 8, p.abertas);
  check('1 cancelada com data no mês', p.canceladas === 1, p.canceladas);
  check('3 de 5 no prazo pela regra oficial', Math.abs(p.noPrazo - 0.6) < 1e-9, p.noPrazo);
  check('3 de 5 pela coluna da planilha', Math.abs(p.noPrazoPlanilha - 0.6) < 1e-9, p.noPrazoPlanilha);
  check('Estratégica: 1 fechada, 40 dias, 0% no prazo', p.estrategica.fechadas === 1 && p.estrategica.diasMedio === 40 && p.estrategica.noPrazo === 0, JSON.stringify(p.estrategica));
  check('fonte Operacional mais usada', p.fontesOperacional[0].nome === 'InfoJobs' && p.fontesOperacional[0].qtd === 3, JSON.stringify(p.fontesOperacional));
  const at = M.ativas(r.linhas);
  check('ativas hoje: 1 aberta, 1 em andamento', at.aberta.total === 1 && at.andamento.total === 1, JSON.stringify([at.aberta.total, at.andamento.total]));
  const mes = M.mensal(r.linhas, 2026);
  check('mensal: julho com 8 abertas e 5 fechadas', mes[6].abertas === 8 && mes[6].fechadas === 5, JSON.stringify(mes[6]));
  check('mensal: junho com 1 aberta', mes[5].abertas === 1, JSON.stringify(mes[5]));
});

run('slides: períodos', () => {
  const m = SL.periodo('mensal', 2026, 9);
  check('mensal setembro', m.de === '2026-09-01' && m.ate === '2026-09-30' && m.label === 'Setembro 2026', JSON.stringify(m));
  const b = SL.periodo('bimestral', 2026, 4);
  check('bimestre 4 = jul–ago', b.de === '2026-07-01' && b.ate === '2026-08-31' && b.label === 'Julho e Agosto 2026', JSON.stringify(b));
  const s = SL.periodo('semestral', 2026, 2);
  check('2º semestre', s.de === '2026-07-01' && s.ate === '2026-12-31', JSON.stringify(s));
  const fev = SL.periodo('mensal', 2024, 2);
  check('fevereiro bissexto', fev.ate === '2024-02-29', fev.ate);
  check('mesmo período do ano anterior', SL.mesmoPeriodoAnoAnterior(b).de === '2025-07-01');
});

run('slides: deck de julho/2026', () => {
  const r = PF.parse(wb(BASE));
  const metas = [{ ano: 2026, mes: 7, meta_abertas: 10, meta_fechadas: 4 }];
  const deck = SL.montar(SL.periodo('mensal', 2026, 7), { vagas: r.linhas, metas, atualizadoEm: '2026-10-08' });
  check('6 slides', deck.length === 6, deck.map(d => d.id).join(','));
  const texto = sd => sd.els.filter(e => e.t === 'text').map(e => e.paras.map(p => p.runs.map(x => x.text).join('')).join(' ')).join(' | ');
  const fin = deck.find(d => d.id === 'rs-finalizadas');
  check('resumo com 5 vagas e 60% no prazo', /Fechamos julho com 5 vagas.*60% dentro do prazo/.test(texto(fin)), texto(fin));
  const nat = fin.els.find(e => e.t === 'chart' && e.title === 'NATUREZA DA VAGA');
  check('natureza agrupa Substituição', nat.labels[0] === 'Substituição' && nat.series[0].values[0] === 4 && nat.series[1].values[0] === 1, JSON.stringify(nat));
  const proj = deck.find(d => d.id === 'rs-projecao');
  check('projeção compara com a meta', /abriram-se 8 vagas \(80% da meta de 10\) e fecharam-se 5 \(125% da meta de 4\)/.test(texto(proj)), texto(proj));
  const ch = proj.els.find(e => e.t === 'chart');
  check('realizado só até o mês do período', ch.series[1].values[6] === 8 && ch.series[1].values[7] === null, JSON.stringify(ch.series[1].values));
  const at = deck.find(d => d.id === 'rs-ativas');
  check('foto das ativas com a data do upload', /EM ANDAMENTO — 1 vagas.*Atualização – 08\/10\/2026/.test(texto(at)), texto(at).slice(0, 200));
  check('todo elemento dentro do slide 960 × 540', deck.every(d => d.els.every(e => e.x >= 0 && e.y >= 0 && e.x + e.w <= 960 && e.y + e.h <= 540)));
});

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
