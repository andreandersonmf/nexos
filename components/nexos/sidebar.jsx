'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Home, Users, Users2, GraduationCap, CalendarCheck, TrendingUp, FileText,
  Bell, MessageSquare, BarChart3, Settings, Sparkles, ChevronUp, LogOut,
} from 'lucide-react';
import { Logo } from './logo';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

const MENU = [
  { label: 'Início',       href: '/dashboard',   icon: Home,           active: true },
  { label: 'Alunos',       href: '/alunos',      icon: Users,          active: true },
  { label: 'Turmas',       href: '/turmas',      icon: Users2,         active: true },
  { label: 'Professores',  href: '/professores', icon: GraduationCap,  active: false },
  { label: 'Frequência',   href: '/frequencia',  icon: CalendarCheck,  active: false },
  { label: 'Desempenho',   href: '/desempenho',  icon: TrendingUp,     active: true },
  { label: 'Documentos',   href: '/documentos',  icon: FileText,       active: false },
  { label: 'Alertas',      href: '/alertas',     icon: Bell,           active: true },
  { label: 'Comunicados',  href: '/comunicados', icon: MessageSquare,  active: false },
  { label: 'Relatórios',   href: '/relatorios',  icon: BarChart3,      active: false },
  { label: 'Configurações',href: '/configuracoes', icon: Settings,     active: false },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('nexos_user');
      if (raw) setUser(JSON.parse(raw));
    } catch {}
  }, []);

  const isActive = (href) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  const handleClick = (item, e) => {
    if (!item.active) {
      e.preventDefault();
      toast.info(`${item.label}: módulo em breve.`);
    }
  };

  const logout = () => {
    localStorage.removeItem('nexos_user');
    router.replace('/login');
  };

  const iaActive = pathname.startsWith('/nexo-ia');

  return (
    <aside className="w-60 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0">
      <div className="px-5 pt-5 pb-4">
        <Logo />
      </div>
      <nav className="flex-1 px-3 overflow-y-auto">
        <ul className="space-y-1">
          {MENU.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link href={item.active ? item.href : '#'} onClick={(e) => handleClick(item, e)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}>
                  <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li className="pt-2">
            <Link href="/nexo-ia"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                iaActive ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}>
              <Sparkles className="w-[18px] h-[18px]" />
              <span>Nexo IA</span>
            </Link>
          </li>
        </ul>
      </nav>
      <div className="border-t border-slate-200 p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-indigo-100 text-indigo-700 text-sm font-medium">
                  {(user?.nome || 'U').split(' ').map((n) => n[0]).slice(0, 2).join('')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">{user?.nome || 'Carregando…'}</div>
                <div className="text-xs text-slate-500 truncate">{user?.cargo || user?.perfil || ''}</div>
              </div>
              <ChevronUp className="w-4 h-4 text-slate-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-48">
            <DropdownMenuItem disabled>Perfil</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-red-600 focus:text-red-700">
              <LogOut className="w-4 h-4 mr-2" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
