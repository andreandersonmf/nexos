import { Sidebar } from '@/components/nexos/sidebar';
import { AuthGuard } from '@/components/nexos/auth-guard';

export default function MainLayout({ children }) {
  return (
    <AuthGuard>
      <div className="min-h-screen flex bg-slate-50">
        <Sidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </AuthGuard>
  );
}
