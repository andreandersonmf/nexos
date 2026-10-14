import { ApiError, requirePerfil, podeGerenciarTurma } from '@/lib/nexos/auth';
import { calcularMetricasAlunos, mediaDe, mediaPorDisciplina, evolucaoPorBimestre } from '@/lib/nexos/metrics';

function escopoRelatorios(db, usuario, turmaId) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR', 'PROFESSOR']);
  let filtroAlunos = {};
  if (usuario.perfil === 'PROFESSOR') {
    if (!Number.isNaN(turmaId)) {
      if (!podeGerenciarTurma(usuario, turmaId)) {
        throw new ApiError(403, 'Você pode gerar relatórios detalhados apenas das suas turmas.');
      }
      filtroAlunos = { turma_id: turmaId };
    } else {
      // Sem turma: somente agregados institucionais (nunca dados individuais)
      return { filtroAlunos: {}, agregado: true };
    }
  } else if (!Number.isNaN(turmaId)) {
    filtroAlunos = { turma_id: turmaId };
  }
  return { filtroAlunos, agregado: false };
}

function csvDe(linhas, colunas) {
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = colunas.map((c) => c.label).map(escape).join(';');
  const corpo = linhas.map((l) => colunas.map((c) => escape(c.valor(l))).join(';')).join('\n');
  return `\uFEFF${header}\n${corpo}`;
}

export async function gerarRelatorio(db, usuario, tipo, query, formato) {
  const turmaId = parseInt(query.get('turma_id'), 10);
  const { filtroAlunos, agregado } = escopoRelatorios(db, usuario, turmaId);
  const { byAluno } = await calcularMetricasAlunos(db, { filtroAlunos });
  const alunos = Object.values(byAluno);

  if (agregado && tipo !== 'indicadores') {
    throw new ApiError(403, 'Selecione uma das suas turmas para gerar este relatório detalhado.');
  }

  let colunas = [];
  let linhas = [];

  if (tipo === 'frequencia') {
    colunas = [
      { label: 'Matrícula', valor: (r) => r.aluno.matricula },
      { label: 'Aluno', valor: (r) => r.aluno.nome },
      { label: 'Turma', valor: (r) => r.turma?.nome || '—' },
      { label: 'Aulas', valor: (r) => r.totalAulas },
      { label: 'Faltas', valor: (r) => r.totalFaltas },
      { label: 'Presença %', valor: (r) => r.freqPct != null ? String(r.freqPct).replace('.', ',') : '—' },
    ];
    linhas = alunos.sort((a, b) => (a.freqPct ?? -1) - (b.freqPct ?? -1));
  } else if (tipo === 'desempenho') {
    const disciplinaId = parseInt(query.get('disciplina_id'), 10);
    colunas = [
      { label: 'Matrícula', valor: (r) => r.aluno.matricula },
      { label: 'Aluno', valor: (r) => r.aluno.nome },
      { label: 'Turma', valor: (r) => r.turma?.nome || '—' },
    ];
    if (!Number.isNaN(disciplinaId)) {
      const disciplina = await db.collection('disciplinas').findOne({ id: disciplinaId });
      if (!disciplina) throw new ApiError(404, 'Disciplina não encontrada.');
      const notas = await db.collection('notas').find({ disciplina_id: disciplinaId }).toArray();
      const porAluno = Object.fromEntries(alunos.map((m) => [m.aluno.matricula, m]));
      const comMedia = Object.values(porAluno).map((m) => {
        const daDisc = notas.filter((n) => n.matricula_aluno === m.aluno.matricula);
        const porBim = {};
        for (const n of daDisc) porBim[n.bimestre] = n.valor;
        const media = mediaDe(daDisc.map((n) => n.valor));
        return { ...m, mediaDisciplina: media, bimestres: porBim };
      });
      colunas.push({ label: `Média ${disciplina.nome}`, valor: (r) => r.mediaDisciplina != null ? String(r.mediaDisciplina).replace('.', ',') : '—' });
      colunas.push({ label: '1º Bim', valor: (r) => r.bimestres[1] != null ? String(r.bimestres[1]).replace('.', ',') : '—' });
      colunas.push({ label: '2º Bim', valor: (r) => r.bimestres[2] != null ? String(r.bimestres[2]).replace('.', ',') : '—' });
      colunas.push({ label: '3º Bim', valor: (r) => r.bimestres[3] != null ? String(r.bimestres[3]).replace('.', ',') : '—' });
      colunas.push({ label: '4º Bim', valor: (r) => r.bimestres[4] != null ? String(r.bimestres[4]).replace('.', ',') : '—' });
      linhas = comMedia.sort((a, b) => a.aluno.nome.localeCompare(b.aluno.nome, 'pt-BR'));
    } else {
      colunas.push({ label: 'Média geral', valor: (r) => r.media != null ? String(r.media).replace('.', ',') : '—' });
      colunas.push({ label: 'Notas lançadas', valor: (r) => r.totalNotas });
      linhas = alunos.sort((a, b) => (a.media ?? -1) - (b.media ?? -1));
    }
  } else if (tipo === 'faltas') {
    colunas = [
      { label: 'Matrícula', valor: (r) => r.aluno.matricula },
      { label: 'Aluno', valor: (r) => r.aluno.nome },
      { label: 'Turma', valor: (r) => r.turma?.nome || '—' },
      { label: 'Faltas', valor: (r) => r.totalFaltas },
      { label: 'Presença %', valor: (r) => r.freqPct != null ? String(r.freqPct).replace('.', ',') : '—' },
    ];
    linhas = alunos.filter((m) => m.totalFaltas > 0).sort((a, b) => b.totalFaltas - a.totalFaltas).slice(0, 30);
  } else if (tipo === 'quedas') {
    colunas = [
      { label: 'Matrícula', valor: (r) => r.aluno.matricula },
      { label: 'Aluno', valor: (r) => r.aluno.nome },
      { label: 'Turma', valor: (r) => r.turma?.nome || '—' },
      { label: 'Média atual', valor: (r) => r.media != null ? String(r.media).replace('.', ',') : '—' },
      { label: 'Variação', valor: (r) => r.variacao != null ? String(r.variacao).replace('.', ',') : '—' },
    ];
    linhas = alunos
      .map((m) => {
        const evol = m.evolucao.filter((e) => e.variacao != null);
        const ultima = evol[evol.length - 1];
        return { ...m, variacao: ultima?.variacao ?? null, bimestre: ultima?.bimestre ?? null };
      })
      .filter((m) => m.variacao != null && m.variacao < 0)
      .sort((a, b) => a.variacao - b.variacao)
      .slice(0, 30);
  } else if (tipo === 'alertas') {
    const alertas = await db.collection('alertas').find({ status: 'aberto' }).toArray();
    const matriculasEscopo = new Set(alunos.map((m) => m.aluno.matricula));
    const visiveis = alertas.filter((a) => matriculasEscopo.has(a.matricula_aluno));
    colunas = [
      { label: 'Aluno', valor: (r) => r.aluno_nome },
      { label: 'Tipo', valor: (r) => r.tipo },
      { label: 'Prioridade', valor: (r) => r.prioridade },
      { label: 'Descrição', valor: (r) => r.descricao },
    ];
    const alunoMap = Object.fromEntries(alunos.map((m) => [m.aluno.matricula, m.aluno.nome]));
    linhas = visiveis.map((a) => ({ ...a, aluno_nome: alunoMap[a.matricula_aluno] || '—' }));
  } else if (tipo === 'indicadores') {
    colunas = [
      { label: 'Indicador', valor: (r) => r.indicador },
      { label: 'Valor', valor: (r) => r.valor },
    ];
    const indicadores = await indicadoresInstitucionais(db, usuario);
    linhas = indicadores.map((i) => ({ indicador: i.label, valor: i.valor }));
  } else {
    throw new ApiError(400, 'Tipo de relatório inválido.');
  }

  if (formato === 'csv') {
    const csv = csvDe(linhas, colunas);
    return { csv, nome: `nexos_${tipo}_${new Date().toISOString().slice(0, 10)}.csv` };
  }
  return {
    tipo,
    colunas: colunas.map((c) => c.label),
    linhas: linhas.map((l) => colunas.map((c) => c.valor(l))),
  };
}

/**
 * Indicadores institucionais agregados.
 * Para professor sem turma selecionada, retorna apenas agregados (sem dados individuais).
 */
export async function indicadoresInstitucionais(db, usuario) {
  requirePerfil(usuario, ['ADMIN', 'COORDENADOR', 'PROFESSOR']);
  const { byAluno } = await calcularMetricasAlunos(db);
  const alunos = Object.values(byAluno);
  const [totalTurmas, alertas, professores] = await Promise.all([
    db.collection('turmas').countDocuments(),
    db.collection('alertas').find({ status: 'aberto' }).toArray(),
    db.collection('usuarios').countDocuments({ perfil: 'PROFESSOR' }),
  ]);

  const medias = alunos.filter((m) => m.media != null).map((m) => m.media);
  const freqs = alunos.filter((m) => m.freqPct != null).map((m) => m.freqPct);
  const freqMedia = mediaDe(freqs);
  const mediaGeral = mediaDe(medias);
  const abaixoMedia = alunos.filter((m) => m.media != null && m.media < 6).length;
  const freqBaixa = alunos.filter((m) => m.freqPct != null && m.freqPct < 75).length;
  const comQueda = alunos.filter((m) => {
    const evol = m.evolucao.filter((e) => e.variacao != null);
    const ultima = evol[evol.length - 1];
    return ultima && ultima.variacao < 0;
  }).length;

  const porPrioridade = { alta: 0, media: 0, baixa: 0 };
  for (const a of alertas) if (porPrioridade[a.prioridade] != null) porPrioridade[a.prioridade]++;
  const porTipo = { frequencia: 0, desempenho: 0, manual: 0 };
  for (const a of alertas) if (porTipo[a.tipo] != null) porTipo[a.tipo]++;

  const indicadores = [
    { label: 'Alunos matriculados', valor: alunos.length },
    { label: 'Turmas ativas', valor: totalTurmas },
    { label: 'Professores', valor: professores },
    { label: 'Média geral das notas', valor: mediaGeral != null ? String(mediaGeral).replace('.', ',') : '—' },
    { label: 'Frequência média', valor: freqMedia != null ? `${String(freqMedia).replace('.', ',')}%` : '—' },
    { label: 'Alunos com média abaixo de 6,0', valor: abaixoMedia },
    { label: 'Alunos com frequência abaixo de 75%', valor: freqBaixa },
    { label: 'Alunos com queda recente de desempenho', valor: comQueda },
    { label: 'Alertas abertos (alta)', valor: porPrioridade.alta },
    { label: 'Alertas abertos (média)', valor: porPrioridade.media },
    { label: 'Alertas abertos (baixa)', valor: porPrioridade.baixa },
    { label: 'Alertas de frequência', valor: porTipo.frequencia },
    { label: 'Alertas de desempenho', valor: porTipo.desempenho },
  ];
  return indicadores;
}
