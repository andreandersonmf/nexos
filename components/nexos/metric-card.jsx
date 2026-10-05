import { Card } from '@/components/ui/card';

export function MetricCard({ icon: Icon, label, value, iconColor = 'indigo' }) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    violet: 'bg-violet-50 text-violet-600',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
    sky: 'bg-sky-50 text-sky-600',
  };
  return (
    <Card className="p-5 border border-slate-200 shadow-none hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${colors[iconColor] || colors.indigo}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="text-2xl font-semibold text-slate-900 leading-tight">{value}</div>
          <div className="text-xs text-slate-500 mt-0.5">{label}</div>
        </div>
      </div>
    </Card>
  );
}
