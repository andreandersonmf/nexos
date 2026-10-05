'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Logo } from '@/components/nexos/logo';
import { Loader2, Printer } from 'lucide-react';

function notaFmt(v) { return v != null ? v.toFixed(1).replace('.', ',') : '—'; }

export default function BoletimPage() {
  const { matricula } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/alunos/${matricula}`).then((r) => r.json())
      .then(setData).finally(() => setLoading(false));
  }, [matricula]);

  if (loading || !data?.aluno) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando boletim…
      </div>
    );
  }

  const { aluno, notas, historico, frequencia, observacoes } = data;
  const dataEmissao = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body { background: white !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="max-w-4xl mx-auto px-4 mb-4 flex items-center justify-between no-print">
        <button onClick={() => window.history.back()}
          className="text-sm text-slate-600 hover:text-slate-900">← Voltar</button>
        <button onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium">
          <Printer className="w-4 h-4" /> Imprimir / Salvar como PDF
        </button>
      </div>

      {/* Documento */}
      <div className="max-w-4xl mx-auto bg-white shadow-sm print:shadow-none border border-slate-200 print:border-0 p-10 print:p-0">
        <header className="flex items-start justify-between pb-6 border-b-2 border-indigo-600">
          <div className="flex items-center gap-3">
            <Logo size="lg" />
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Documento</div>
            <div className="text-xl font-semibold text-slate-900">Boletim Escolar</div>
            <div className="text-xs text-slate-500 mt-1">Emitido em {dataEmissao}</div>
          </div>
        </header>

        {/* Dados do aluno */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide mb-3">Dados do aluno</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
            <div>
              <div className="text-xs text-slate-500">Nome completo</div>
              <div className="font-medium text-slate-900">{aluno.nome}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Matrícula</div>
              <div className="font-medium text-slate-900">{aluno.matricula}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Turma</div>
              <div className="font-medium text-slate-900">{aluno.turma || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Situação</div>
              <div className="font-medium text-slate-900">{aluno.status || 'ATIVO'}</div>
            </div>
          </div>
        </section>

        {/* Notas */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide mb-3">Histórico de notas</h2>
          <table className="w-full text-sm border border-slate-200">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="p-2 border-r border-slate-200 font-medium text-slate-700">Bimestre</th>
                {notas.map((n) => (
                  <th key={n.disciplina} className="p-2 border-r border-slate-200 font-medium text-slate-700 text-center">
                    {n.disciplina}
                  </th>
                ))}
                <th className="p-2 font-medium text-slate-700 text-center">Média</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((row) => (
                <tr key={row.bimestre} className="border-t border-slate-200">
                  <td className="p-2 border-r border-slate-200 font-medium">{row.bimestre}</td>
                  {notas.map((n) => (
                    <td key={n.disciplina} className="p-2 border-r border-slate-200 text-center">
                      {notaFmt(row[n.disciplina])}
                    </td>
                  ))}
                  <td className="p-2 text-center font-semibold">{notaFmt(row['Média'])}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300 bg-indigo-50/50">
                <td className="p-2 border-r border-slate-200 font-semibold text-indigo-700">Média final</td>
                {notas.map((n) => (
                  <td key={n.disciplina} className="p-2 border-r border-slate-200 text-center font-semibold text-indigo-700">
                    {notaFmt(n.media)}
                  </td>
                ))}
                <td className="p-2 text-center font-semibold text-indigo-700">
                  {notaFmt(notas.filter((x) => x.media != null).reduce((s, x, _, arr) => s + x.media / arr.length, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Frequencia */}
        <section className="mt-8 grid grid-cols-3 gap-6">
          <div className="col-span-3">
            <h2 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide mb-3">Frequência</h2>
          </div>
          <div className="border border-slate-200 rounded p-4">
            <div className="text-xs text-slate-500">Presença</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{frequencia.percentual}%</div>
          </div>
          <div className="border border-slate-200 rounded p-4">
            <div className="text-xs text-slate-500">Faltas</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{frequencia.faltas}</div>
          </div>
          <div className="border border-slate-200 rounded p-4">
            <div className="text-xs text-slate-500">Total de aulas</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{frequencia.totalAulas}</div>
          </div>
        </section>

        {/* Observações */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide mb-3">Observações pedagógicas</h2>
          {observacoes.length === 0 ? (
            <div className="text-sm text-slate-500">Nenhuma observação registrada.</div>
          ) : (
            <ul className="space-y-2 text-sm">
              {observacoes.map((o, i) => (
                <li key={i} className="flex gap-3 border-l-2 border-indigo-300 pl-3 py-1">
                  <div className="text-xs text-slate-500 min-w-[90px]">
                    {new Date(o.data).toLocaleDateString('pt-BR')}
                  </div>
                  <div className="flex-1 text-slate-800">{o.texto}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-12 pt-4 border-t border-slate-200 text-xs text-slate-400 text-center">
          Documento gerado automaticamente pelo sistema Nexo's · {dataEmissao}
        </footer>
      </div>
    </div>
  );
}
