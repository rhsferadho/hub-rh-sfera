// Testa Treinamento e Desenvolvimento → Turmas e Multiplicadoras fora do
// navegador: leitura da planilha "Controle de Treinamentos" (js/parsers-turmas.js),
// as contas (js/metrics-turmas.js) e o slide do Fechamento.
// Roda com: node test/turmas.test.js
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
// SheetJS falso: a aba é { matriz (valores brutos), texto (formatados) } e só a leitura por linhas (header: 1) é usada.
ctx.XLSX = { utils: { sheet_to_json: (ws, o) => (o && o.raw === false ? ws.texto : ws.matriz) } };
vm.createContext(ctx);
for (const f of ['js/utils.js', 'js/parsers.js', 'js/parsers-turmas.js', 'js/metrics-turmas.js', 'js/fechamento-slides.js', 'js/fechamento-slides-cultura.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const P = ctx.HUB_PARSERS_TURMAS;
const T = ctx.HUB_METRICS_TURMAS;

const CAB = ['Data', 'Mês Ref.:', 'Tema', 'Modalidade', 'Local', 'Início', 'Fim', 'Volume de horas', 'Alvo', 'Origem', 'Marca', 'Canal', 'Convocados', 'Presentes', 'Taxa de Adesão', 'Multiplicador(a)'];
const d = iso => new Date(iso + 'T12:00:00');
// [data, tema, local, ini, fim, vol, alvo, marca, canal, conv, pres, multi]
function aba(linhas, extraTopo) {
  const linha = l => [d(l[0]), +l[0].slice(5, 7), l[1], 'Presencial', l[2], l[3], l[4], l[5], l[6], l[7], l[7], l[8], l[9], l[10], '', l[11]];
  const texto = l => [l[0].split('-').reverse().join('/'), '', l[1], 'Presencial', l[2], l[3], l[4], l[5], l[6], l[7], l[7], l[8], String(l[9]), String(l[10]), '', l[11]];
  const topo = extraTopo || [];
  return { matriz: topo.concat([CAB], linhas.map(linha)), texto: topo.concat([CAB], linhas.map(texto)) };
}
const ANA = 'Ana Multi', BIA = 'Bia Multi';
const linhasAna = [
  ['2025-09-10', "INTEGRAÇÃO LEVI'S", 'Auditório', '10:00', '18:00', '08:00', 'Liderados', "Levi's", 'Loja', 4, 4, ANA],
  ['2026-09-02', 'NTEGRAÇÃO HERING', 'Sala Todos Somos Sfera', '10:00', '18:00', '08:00', 'Liderado', 'Hering', 'Loja', 3, 2, ANA],
  ['2026-09-08', "TREINAMENTO LEVI'S H2", 'Loja', '09:00', '13:00', '04:00', 'Liderdados', 'Levis', 'Loja', 10, 12, ANA],
  ['2026-09-15', 'INTEGRAÇÃO SFERA/BOTI', 'Sala Somos Todos Sfera', '14:00', '17:00', '03:00', 'Líder', 'Sfera/Boti', 'Escritório/Loja', 2, 2, `${ANA} & ${BIA}`],
  ['2026-09-20', 'TREINEMANETO DE MARCAS', 'Sala', '09:00', '14:00', '04:30', 'Liderados', 'Quem disse, Berenice?', 'Loja', 5, 5, ANA]
];
const wbAna = { SheetNames: ['Controle de Treinamentos -2025', 'Controle de Treinamentos'], Workbook: { Sheets: [{ name: 'Controle de Treinamentos -2025', Hidden: 1 }, { name: 'Controle de Treinamentos', Hidden: 0 }] },
  Sheets: { 'Controle de Treinamentos -2025': aba(linhasAna.slice(0, 1), [['', 'Controle de Treinamentos - 2025'], []]), 'Controle de Treinamentos': aba(linhasAna) } };

let r;
run('Leitura da planilha', () => {
  r = P.parse(wbAna);
  check('usa a aba visível, não a antiga oculta', r.aba === 'Controle de Treinamentos' && r.turmas.length === 5, r.aba);
  check('dona da planilha = multiplicadora que mais aparece', r.planilha === ANA);
  const t = Object.fromEntries(r.turmas.map(x => [x.data, x]));
  check('erro de digitação no tema corrigido', t['2026-09-02'].tema === 'INTEGRAÇÃO HERING' && t['2026-09-20'].tema === 'TREINAMENTO DE MARCAS');
  check('tipo de turma pelo tema', t['2026-09-02'].categoria === 'Integração e onboarding' && t['2026-09-08'].categoria === 'Produto e vendas');
  check("Levis → Levi's", t['2026-09-08'].marcas.join() === "Levi's");
  check('marcas juntas viram lista', t['2026-09-15'].marcas.join() === 'Sfera,O Boticário');
  check('vírgula de "Quem disse, Berenice?" não quebra a marca', t['2026-09-20'].marcas.join() === 'Quem disse, Berenice?');
  check('público padronizado', t['2026-09-02'].publico === 'Liderados' && t['2026-09-08'].publico === 'Liderados' && t['2026-09-15'].publico === 'Líderes');
  check('canal padronizado', t['2026-09-15'].canal === 'Loja e Escritório');
  check('local padronizado', t['2026-09-02'].local === 'Sala Somos Todos Sfera');
  check('multiplicadoras em dupla', t['2026-09-15'].multiplicadoras.join() === `${ANA},${BIA}`);
  check('horário e volume de horas', t['2026-09-02'].hora_inicio === '10:00' && t['2026-09-02'].horas === 8);
  check('alerta: presentes maior que convocados', t['2026-09-08'].alertas.some(a => /presentes/.test(a)));
  check('alerta: volume diferente do horário (4,5 h x 5 h)', t['2026-09-20'].alertas.some(a => /volume/.test(a)) && t['2026-09-20'].horas === 4.5);
  check('avisos resumidos', r.avisos.some(a => /inconsist/.test(a)) && r.avisos.some(a => /digitação/.test(a)), r.avisos.join(' | '));
  let erro = null;
  try { P.parse({ SheetNames: ['x'], Sheets: { x: { matriz: [['a']], texto: [['a']] } } }); } catch (e) { erro = e.message; }
  check('planilha errada dá erro claro', /aba de controle/.test(erro || ''), erro);
});

run('Turma repetida na planilha de outra multiplicadora', () => {
  const existentes = [{ planilha: BIA, data: '2026-09-15', hora_inicio: '14:00', tema: 'INTEGRAÇÃO SFERA/BOTI' }];
  const r2 = P.parse(wbAna, { existentes });
  check('avisa que vai contar duas vezes', r2.avisos.some(a => /também estão em planilha de Bia Multi/.test(a)), r2.avisos.join(' | '));
});

run('Turma já lançada no Hub pela própria multiplicadora', () => {
  const r3 = P.parse(wbAna, { existentes: [{ planilha: ANA, origem: 'hub', data: '2026-09-02', hora_inicio: '10:00', tema: 'INTEGRAÇÃO HERING' }] });
  check('avisa que vai contar duas vezes (Hub)', r3.avisos.some(a => /lançamentos do Hub/.test(a)), r3.avisos.join(' | '));
  const r4 = P.parse(wbAna, { existentes: [{ planilha: ANA, origem: 'planilha', data: '2026-09-02', hora_inicio: '10:00', tema: 'INTEGRAÇÃO HERING' }] });
  check('a própria planilha antiga não conta como repetida', !r4.avisos.some(a => /também estão em/.test(a)));
});

run('Contas', () => {
  const turmas = r.turmas.map(t => Object.assign({ planilha: ANA }, t));
  const p = T.painel(turmas, { de: '2026-09-01', ate: '2026-09-30' }, [
    { unidade: 'Hering', data_admissao: '2026-09-05' }, { unidade: 'Hering', data_admissao: '2026-09-25' }, { unidade: 'Hering', data_admissao: '2025-01-01' }
  ]);
  check('turmas do período', p.total.turmas === 4);
  check('horas = soma das durações', perto(p.total.horas, 8 + 4 + 3 + 4.5));
  check('horas × pessoa = duração × presentes', perto(p.total.horasPessoa, 8 * 2 + 4 * 12 + 3 * 2 + 4.5 * 5));
  check('presença limita a turma com mais presentes que convocados', perto(p.total.presenca, (2 + 10 + 2 + 5) / (3 + 10 + 2 + 5)));
  check('ano anterior (set/2025)', p.anterior && p.anterior.turmas === 1 && p.anterior.horas === 8);
  const multis = Object.fromEntries(p.porMultiplicadora.map(x => [x.label, x]));
  check('turma em dupla entra para as duas', multis[ANA].turmas === 4 && multis[BIA].turmas === 1);
  check('marca: turma de duas marcas entra em cada', p.porMarca.some(x => x.label === 'O Boticário' && x.turmas === 1) && p.porMarca.some(x => x.label === 'Sfera' && x.turmas === 1));
  const her = p.cobertura.find(x => x.marca === 'Hering');
  check('cobertura da integração: presentes ÷ admitidos no período', her && her.integrados === 2 && her.admitidos === 2 && her.cobertura === 1, JSON.stringify(her));
  check('alertas listados', p.comAlerta.length === 2);
  const ano = T.painel(turmas, { de: '2026-09-01', ate: '2026-09-30', multiplicadora: BIA }, []);
  check('filtro de multiplicadora', ano.total.turmas === 1);
  const comAnt = T.painel(turmas, { de: '2026-01-01', ate: '2026-12-31' }, []);
  check('comparação com o ano anterior', comAnt.anterior && comAnt.anterior.turmas === 1);
});

run('Slide do Fechamento', () => {
  const turmas = r.turmas.map(t => Object.assign({ planilha: ANA }, t));
  const p = ctx.HUB_FECHAMENTO_SLIDES.periodo('mensal', 2026, 9);
  const cult = { OPERACOES: [], mes: () => ({ empresa: { ind: {} }, operacoes: {} }), turmas, colaboradores: [] };
  const sl = ctx.HUB_FECHAMENTO_CULTURA.td(p, cult).find(s => s.id === 'td-multis');
  check('slide entra quando há turmas', !!sl);
  const textos = sl.els.flat().filter(e => e && e.t === 'text').map(e => e.paras.map(x => x.runs.map(y => y.text).join('')).join(' ')).join(' | ');
  check('texto de abertura com turmas e horas', /4 turmas/.test(textos) && /19,5 h de treinamento/.test(textos), textos.slice(0, 200));
  const sem = ctx.HUB_FECHAMENTO_CULTURA.td(p, Object.assign({}, cult, { turmas: [] }));
  check('sem turmas no Hub, o slide não entra', !sem.some(s => s.id === 'td-multis'));
});

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
