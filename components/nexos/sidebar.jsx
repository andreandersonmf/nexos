'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, Users, Users2, GraduationCap, CalendarCheck, TrendingUp, FileText,
  Bell, MessageSquare, BarChart3, Settings, Sparkles, ChevronUp, LogOut,
} from 'lucide-react';
import { Logo } from './logo';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { useAuth } from './auth-provider';

const MENU_BASE = [
  { label: 'Início',        href: '/dashboard',    icon: Home },
  { label: 'Alunos',        href: '/alunos',       icon: Users,       perfis: ['ADMIN', 'COORDENADOR', 'PROFESSOR'] },
  { label: 'Turmas',        href: '/turmas',       icon: Users2,      perfis: ['ADMIN', 'COORDENADOR', 'PROFESSOR'] },
  { label: 'Professores',   href: '/professores',  icon: GraduationCap, perfis: ['ADMIN', 'COORDENADOR', 'PROFESSOR'] },
  { label: 'Frequência',    href: '/frequencia',   icon: CalendarCheck },
  { label: 'Desempenho',    href: '/desempenho',   icon: TrendingUp },
  { label: 'Documentos',    href: '/documentos',   icon: FileText },
  { label: 'Alertas',       href: '/alertas',      icon: Bell,        perfis: ['ADMIN', 'COORDENADOR', 'PROFESSOR'] },
  { label: 'Comunicados',   href: '/comunicados',  icon: MessageSquare },
  { label: 'Relatórios',    href: '/relatorios',   icon: BarChart3,   perfis: ['ADMIN', 'COORDENADOR', 'PROFESSOR'] },
  { label: 'Configurações', href: '/configuracoes', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const menu = MENU_BASE.filter((item) => !item.perfis || item.perfis.includes(user?.perfil));

  const isActive = (href) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  const iaActive = pathname.startsWith('/nexo-ia');

  return (
    <aside className="w-60 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0">
      <div className="px-5 pt-5 pb-4">
        <Logo />
      </div>
      <nav className="flex-1 px-3 overflow-y-auto">
        <ul className="space-y-1">
          {menu.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link href={item.href}
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
              <Sparkles className="w-[18px] h-[18px]" strokeWidth={2} />
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
            <Link href="/configuracoes">
              <DropdownMenuItem>Perfil e configurações</DropdownMenuItem>
            </Link>
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
