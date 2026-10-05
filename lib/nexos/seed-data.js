// Seed data for Nexo's school management MVP
// Idempotent — runs only if collections are empty

import { getDb } from '@/lib/mongodb';

const USUARIOS = [
  { id: 1, email: 'ana@nexos.com', senha: 'nexos123', perfil: 'COORDENADOR', nome: 'Ana Souza', cargo: 'Coordenadora' },
  { id: 2, email: 'carlos@nexos.com', senha: 'nexos123', perfil: 'PROFESSOR', nome: 'Prof. Carlos Mendes', cargo: 'Professor de Matemática' },
  { id: 3, email: 'julia@nexos.com', senha: 'nexos123', perfil: 'PROFESSOR', nome: 'Prof. Julia Ribeiro', cargo: 'Professora de Português' },
  { id: 4, email: 'admin@nexos.com', senha: 'nexos123', perfil: 'ADMIN', nome: 'Admin do Sistema', cargo: 'Administrador' },
];

const TURMAS = [
  { id: 1, nome: '7º A', ano_letivo: 2025, turno: 'Manhã' },
  { id: 2, nome: '7º B', ano_letivo: 2025, turno: 'Manhã' },
  { id: 3, nome: '8º A', ano_letivo: 2025, turno: 'Tarde' },
  { id: 4, nome: '8º B', ano_letivo: 2025, turno: 'Tarde' },
];

const DISCIPLINAS = [
  { id: 1, nome: 'Matemática' },
  { id: 2, nome: 'Português' },
  { id: 3, nome: 'História' },
  { id: 4, nome: 'Ciências' },
  { id: 5, nome: 'Geografia' },
];

// 15 alunos distribuídos nas turmas
const ALUNOS = [
  { matricula: 'NX2025001', nome: 'Ana Oliveira',   turma_id: 1, data_nascimento: '2012-03-14', cpf: '111.111.111-01', perfil_risco: 'alto' },
  { matricula: 'NX2025002', nome: 'Bruno Santos',   turma_id: 1, data_nascimento: '2012-07-02', cpf: '111.111.111-02', perfil_risco: 'baixo' },
  { matricula: 'NX2025003', nome: 'Carla Souza',    turma_id: 2, data_nascimento: '2012-01-25', cpf: '111.111.111-03', perfil_risco: 'baixo' },
  { matricula: 'NX2025004', nome: 'Daniel Costa',   turma_id: 2, data_nascimento: '2012-11-18', cpf: '111.111.111-04', perfil_risco: 'medio' },
  { matricula: 'NX2025005', nome: 'Eduarda Lima',   turma_id: 3, data_nascimento: '2011-05-09', cpf: '111.111.111-05', perfil_risco: 'baixo' },
  { matricula: 'NX2025006', nome: 'Felipe Alves',   turma_id: 3, data_nascimento: '2011-09-30', cpf: '111.111.111-06', perfil_risco: 'baixo' },
  { matricula: 'NX2025007', nome: 'Gabriela Rocha', turma_id: 4, data_nascimento: '2011-02-11', cpf: '111.111.111-07', perfil_risco: 'baixo' },
  { matricula: 'NX2025008', nome: 'Henrique Lopes', turma_id: 4, data_nascimento: '2011-08-23', cpf: '111.111.111-08', perfil_risco: 'baixo' },
  { matricula: 'NX2025009', nome: 'João Santos',    turma_id: 1, data_nascimento: '2012-04-04', cpf: '111.111.111-09', perfil_risco: 'medio' },
  { matricula: 'NX2025010', nome: 'Lucas Ferreira', turma_id: 3, data_nascimento: '2011-12-15', cpf: '111.111.111-10', perfil_risco: 'alto' },
  { matricula: 'NX2025011', nome: 'Mariana Dias',   turma_id: 2, data_nascimento: '2012-06-07', cpf: '111.111.111-11', perfil_risco: 'baixo' },
  { matricula: 'NX2025012', nome: 'Nicolas Pereira',turma_id: 1, data_nascimento: '2012-10-21', cpf: '111.111.111-12', perfil_risco: 'baixo' },
  { matricula: 'NX2025013', nome: 'Olivia Martins', turma_id: 4, data_nascimento: '2011-07-14', cpf: '111.111.111-13', perfil_risco: 'medio' },
  { matricula: 'NX2025014', nome: 'Paulo Henrique', turma_id: 3, data_nascimento: '2011-03-29', cpf: '111.111.111-14', perfil_risco: 'baixo' },
  { matricula: 'NX2025015', nome: 'Rafaela Nunes',  turma_id: 2, data_nascimento: '2012-09-05', cpf: '111.111.111-15', perfil_risco: 'baixo' },
];

const RESPONSAVEIS = ALUNOS.map((a, i) => ({
  id: i + 1,
  matricula_aluno: a.matricula,
  nome: `Responsável de ${a.nome.split(' ')[0]}`,
  cpf: `999.999.999-${String(i).padStart(2, '0')}`,
  telefone: `(11) 99${String(1000 + i).slice(-4)}-0000`,
  parentesco: i % 2 === 0 ? 'Mãe' : 'Pai',
  financeiro: true,
}));

function gerarNotas() {
  const notas = [];
  let id = 1;
  for (const aluno of ALUNOS) {
    for (const disc of DISCIPLINAS) {
      // valor base por perfil
      const base = aluno.perfil_risco === 'alto' ? 4.5 : aluno.perfil_risco === 'medio' ? 6.5 : 8.0;
      for (let bim = 1; bim <= 2; bim++) {
        const variacao = (Math.random() - 0.5) * 2.5;
        const valor = Math.max(0, Math.min(10, Math.round((base + variacao) * 10) / 10));
        notas.push({
          id: id++,
          matricula_aluno: aluno.matricula,
          disciplina_id: disc.id,
          disciplina_nome: disc.nome,
          bimestre: bim,
          valor,
          data_lancamento: new Date(2025, bim * 3, 15).toISOString(),
        });
      }
    }
  }
  return notas;
}

function gerarFrequencia() {
  const freq = [];
  let id = 1;
  // últimos 30 dias letivos
  const hoje = new Date();
  for (const aluno of ALUNOS) {
    const taxaPresenca = aluno.perfil_risco === 'alto' ? 0.65 : aluno.perfil_risco === 'medio' ? 0.85 : 0.96;
    for (let d = 0; d < 30; d++) {
      const data = new Date(hoje);
      data.setDate(hoje.getDate() - d);
      const presente = Math.random() < taxaPresenca;
      freq.push({
        id: id++,
        matricula_aluno: aluno.matricula,
        disciplina_id: ((d % 5) + 1),
        data_aula: data.toISOString().slice(0, 10),
        presente,
        justificativa: !presente && Math.random() < 0.3 ? 'Atestado médico' : null,
      });
    }
  }
  return freq;
}

const OBSERVACOES = [
  { matricula_aluno: 'NX2025001', professor: 'Prof. Carlos', data: '2024-05-12', texto: 'Apresenta dificuldade em interpretar textos.', tipo: 'pedagogica' },
  { matricula_aluno: 'NX2025001', professor: 'Prof. Julia',  data: '2024-04-28', texto: 'Evolução na participação em sala.', tipo: 'pedagogica' },
  { matricula_aluno: 'NX2025001', professor: 'Prof. Carlos', data: '2024-04-15', texto: 'Necessita de maior atenção nas atividades de casa.', tipo: 'pedagogica' },
  { matricula_aluno: 'NX2025009', professor: 'Prof. Carlos', data: '2024-05-08', texto: 'Queda nas notas de Matemática nas últimas avaliações.', tipo: 'alerta' },
  { matricula_aluno: 'NX2025009', professor: 'Prof. Julia',  data: '2024-04-20', texto: 'Participa pouco das discussões em grupo.', tipo: 'pedagogica' },
  { matricula_aluno: 'NX2025010', professor: 'Prof. Carlos', data: '2024-05-10', texto: 'Muitas faltas nas últimas 2 semanas.', tipo: 'alerta' },
  { matricula_aluno: 'NX2025010', professor: 'Prof. Julia',  data: '2024-05-05', texto: 'Precisa de reforço em interpretação de texto.', tipo: 'pedagogica' },
  { matricula_aluno: 'NX2025004', professor: 'Prof. Carlos', data: '2024-05-02', texto: 'Melhorou o rendimento no último bimestre.', tipo: 'pedagogica' },
  { matricula_aluno: 'NX2025013', professor: 'Prof. Julia',  data: '2024-04-30', texto: 'Precisa melhorar a frequência.', tipo: 'alerta' },
];

const ALERTAS = [
  { id: 1, matricula_aluno: 'NX2025001', tipo: 'frequencia', prioridade: 'alta',  descricao: 'Frequência abaixo de 75% nas últimas 4 semanas.', data: new Date().toISOString(), status: 'aberto' },
  { id: 2, matricula_aluno: 'NX2025009', tipo: 'desempenho', prioridade: 'media', descricao: 'Queda nas notas de Matemática nas últimas avaliações.', data: new Date().toISOString(), status: 'aberto' },
  { id: 3, matricula_aluno: 'NX2025010', tipo: 'frequencia', prioridade: 'alta',  descricao: 'Muitas faltas nas últimas 2 semanas.', data: new Date().toISOString(), status: 'aberto' },
  { id: 4, matricula_aluno: 'NX2025013', tipo: 'frequencia', prioridade: 'media', descricao: 'Frequência irregular detectada.', data: new Date().toISOString(), status: 'aberto' },
  { id: 5, matricula_aluno: 'NX2025004', tipo: 'desempenho', prioridade: 'baixa', descricao: 'Nota média levemente abaixo do esperado.', data: new Date().toISOString(), status: 'aberto' },
];

const ATIVIDADES = [
  { id: 1, tipo: 'nota',       descricao: 'Prof.ª Ana publicou notas no 7º A',                    data: new Date().toISOString() },
  { id: 2, tipo: 'presenca',   descricao: 'Prof. Carlos registrou presença no 7º B',             data: new Date(Date.now() - 2*3600e3).toISOString() },
  { id: 3, tipo: 'observacao', descricao: 'Prof.ª Julia adicionou observações em Maria Silva',   data: new Date(Date.now() - 5*3600e3).toISOString() },
  { id: 4, tipo: 'documento',  descricao: 'Boletim do 2º Bimestre publicado para 7º A',          data: new Date(Date.now() - 24*3600e3).toISOString() },
];

export async function ensureSeed() {
  const db = await getDb();
  const count = await db.collection('alunos').countDocuments();
  if (count > 0) return { seeded: false };

  const notas = gerarNotas();
  const frequencia = gerarFrequencia();

  await Promise.all([
    db.collection('usuarios').insertMany(USUARIOS),
    db.collection('turmas').insertMany(TURMAS),
    db.collection('disciplinas').insertMany(DISCIPLINAS),
    db.collection('alunos').insertMany(ALUNOS),
    db.collection('responsaveis').insertMany(RESPONSAVEIS),
    db.collection('notas').insertMany(notas),
    db.collection('frequencia').insertMany(frequencia),
    db.collection('observacoes').insertMany(OBSERVACOES.map((o, i) => ({ ...o, id: i + 1 }))),
    db.collection('alertas').insertMany(ALERTAS),
    db.collection('atividades').insertMany(ATIVIDADES),
  ]);

  return { seeded: true, totals: { alunos: ALUNOS.length, notas: notas.length, frequencia: frequencia.length } };
}

export async function resetSeed() {
  const db = await getDb();
  const colls = ['usuarios','turmas','disciplinas','alunos','responsaveis','notas','frequencia','observacoes','alertas','atividades'];
  await Promise.all(colls.map((c) => db.collection(c).deleteMany({})));
  return ensureSeed();
}
