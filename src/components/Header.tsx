import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Contrast } from 'lucide-react';

export type WorkspaceTab = 'studio' | 'call' | 'users' | 'queue' | 'admin';

interface HeaderProps {
  studioBrand?: string;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isAdminRoute: boolean;
  highContrastAdmin?: boolean;
  onToggleHighContrastAdmin?: () => void;
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onNavigateRoute: (path: '/' | '/admin') => void;
  onLogin: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  studioBrand = 'Maison Aura',
  isAuthenticated,
  isAdmin,
  isAdminRoute,
  highContrastAdmin = false,
  onToggleHighContrastAdmin,
  activeTab,
  onSelectTab,
  onNavigateRoute,
  onLogin,
  onLogout,
}) => {
  const navItems: Array<{ label: string; active: boolean; onClick: () => void }> =
    isAuthenticated
      ? isAdmin
        ? isAdminRoute
          ? [
              {
                label: 'Administração',
                active: true,
                onClick: () => onNavigateRoute('/admin'),
              },
              {
                label: 'Recepção Pública',
                active: false,
                onClick: () => {
                  onNavigateRoute('/');
                  onSelectTab('studio');
                },
              },
              {
                label: 'Usuários',
                active: false,
                onClick: () => {
                  onNavigateRoute('/');
                  onSelectTab('users');
                },
              },
            ]
          : [
              {
                label: 'Estúdio',
                active: activeTab === 'studio',
                onClick: () => onSelectTab('studio'),
              },
              {
                label: 'Videochamada',
                active: activeTab === 'call',
                onClick: () => onSelectTab('call'),
              },
              {
                label: 'Usuários',
                active: activeTab === 'users',
                onClick: () => onSelectTab('users'),
              },
              {
                label: 'Administração',
                active: false,
                onClick: () => onNavigateRoute('/admin'),
              },
            ]
        : [
            {
              label: 'Recepção',
              active: activeTab === 'studio',
              onClick: () => onSelectTab('studio'),
            },
            {
              label: 'Videochamada',
              active: activeTab === 'call',
              onClick: () => onSelectTab('call'),
            },
            {
              label: 'Minha Fila',
              active: activeTab === 'queue',
              onClick: () => onSelectTab('queue'),
            },
          ]
      : [];

  return (
    <header className="sticky top-0 z-30 bg-[#0B060F]/75 backdrop-blur-xl border-b border-[#F4C2D7]/15 shadow-[0_12px_36px_-18px_rgba(0,0,0,0.8)]">
      <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Lotus Brand Mark + Single-line Wordmark */}
        <button
          type="button"
          onClick={() => {
            onNavigateRoute('/');
            onSelectTab('studio');
          }}
          className="group inline-flex items-center gap-2.5 font-display text-2xl font-semibold tracking-wide text-[#FAF4F7] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4C2D7] rounded"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 28 24"
            className="w-6 h-5 text-[#F4C2D7] shrink-0 transition-transform duration-200 group-hover:scale-105 drop-shadow-[0_0_8px_rgba(244,194,215,0.45)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M14 3c2.5 3.6 3.5 7 3.5 10.5S15.8 19.5 14 21c-1.8-1.5-3.5-4-3.5-7.5S11.5 6.6 14 3Z" />
            <path d="M10.5 17.5C6.8 16.8 4 13.8 3 9.5c3.5.4 6.2 2.2 7.5 5.2" />
            <path d="M17.5 17.5c3.7-.7 6.5-3.7 7.5-8-3.5.4-6.2 2.2-7.5 5.2" />
          </svg>
          <span>{studioBrand}</span>
        </button>

        {/* Zone 2: Clean single-line text links */}
        {isAuthenticated ? (
          <nav
            aria-label="Navegação principal"
            className="hidden md:flex items-center gap-7 text-sm font-medium"
          >
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className={`relative py-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  item.active
                    ? 'text-[#FAF4F7]'
                    : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                }`}
              >
                <span>{item.label}</span>
                {item.active && (
                  <motion.span
                    layoutId="header-active-nav"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-x-0 -bottom-0.5 h-[1.5px] rounded-full bg-gradient-to-r from-[#F4C2D7]/40 via-[#F8D6E3] to-[#F4C2D7]/40 shadow-[0_0_10px_rgba(244,194,215,0.7)]"
                  />
                )}
              </button>
            ))}
          </nav>
        ) : (
          <nav
            aria-label="Navegação institucional"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#C9BAC4]"
          >
            <a
              href="#estudio"
              onClick={() => {
                if (isAdminRoute) onNavigateRoute('/');
              }}
              className="hover:text-[#FAF4F7] transition-colors whitespace-nowrap shrink-0"
            >
              O Estúdio
            </a>
            <a
              href="#experiencias"
              onClick={() => {
                if (isAdminRoute) onNavigateRoute('/');
              }}
              className="hover:text-[#FAF4F7] transition-colors whitespace-nowrap shrink-0"
            >
              Experiências
            </a>
            <a
              href="#galeria"
              onClick={() => {
                if (isAdminRoute) onNavigateRoute('/');
              }}
              className="hover:text-[#FAF4F7] transition-colors whitespace-nowrap shrink-0"
            >
              Galeria
            </a>
            <a
              href="#planos"
              onClick={() => {
                if (isAdminRoute) onNavigateRoute('/');
              }}
              className="hover:text-[#FAF4F7] transition-colors whitespace-nowrap shrink-0"
            >
              Planos
            </a>
            <button
              type="button"
              onClick={() => onNavigateRoute(isAdminRoute ? '/' : '/admin')}
              className={`hover:text-[#FAF4F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isAdminRoute ? 'text-[#F4C2D7]' : ''
              }`}
            >
              {isAdminRoute ? 'Área do Internauta' : 'Área da Modelo'}
            </button>
          </nav>
        )}

        {/* Zone 3: Primary action (+ admin high-contrast toggle when authenticated as model admin) */}
        <div className="flex items-center gap-2.5 shrink-0">
          {isAuthenticated && isAdmin && onToggleHighContrastAdmin && (
            <button
              type="button"
              aria-pressed={highContrastAdmin}
              onClick={onToggleHighContrastAdmin}
              title="Alternar tema de alto contraste para o painel administrativo"
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-full border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4C2D7] ${
                highContrastAdmin
                  ? 'bg-[#FDE047] border-[#FDE047] text-[#000000]'
                  : 'bg-[#150D1D] border-[#F4C2D7]/25 text-[#FAF4F7] hover:border-[#F4C2D7]/60'
              }`}
            >
              <Contrast className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Alto Contraste</span>
            </button>
          )}

          {isAuthenticated ? (
            <button
              type="button"
              onClick={onLogout}
              className="px-4 py-2 text-xs font-medium text-[#FAF4F7] bg-[#1A1024] border border-[#F4C2D7]/25 rounded-full hover:bg-[#281837] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4C2D7]"
            >
              Sair
            </button>
          ) : (
            <button
              type="button"
              onClick={onLogin}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-full luxury-rose-cta transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FAF4F7]"
            >
              <span>Entrar no Estúdio</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          )}
        </div>
      </div>

      {/* Mobile compact nav row when authenticated */}
      {isAuthenticated && (
        <nav
          aria-label="Navegação móvel"
          className="md:hidden flex items-center gap-4 px-6 pb-2.5 overflow-x-auto text-xs font-medium border-t border-[#F4C2D7]/10 pt-2"
        >
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className={`whitespace-nowrap shrink-0 cursor-pointer ${
                item.active ? 'text-[#F4C2D7]' : 'text-[#C9BAC4]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}
      <div aria-hidden="true" className="tech-ambient-layer tech-horizon-line opacity-65" />
    </header>
  );
};
