import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Contrast } from 'lucide-react';

export type WorkspaceTab = 'studio' | 'call' | 'queue';

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
        ? [
            {
              label: 'Administração da Modelo',
              active: isAdminRoute,
              onClick: () => onNavigateRoute('/admin'),
            },
            {
              label: 'Página do Internauta',
              active: !isAdminRoute,
              onClick: () => {
                onNavigateRoute('/');
                onSelectTab('studio');
              },
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
    <header className="sticky top-0 z-30 bg-[#060818]/80 backdrop-blur-2xl border-b border-[#818CF8]/20 shadow-[0_14px_40px_-18px_rgba(2,6,23,0.88)]">
      <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Geometric Luminous Emblem + Single-line Wordmark */}
        <button
          type="button"
          onClick={() => {
            if (isAuthenticated && isAdmin) {
              onNavigateRoute('/admin');
            } else {
              onNavigateRoute('/');
              onSelectTab('studio');
            }
          }}
          className="group inline-flex items-center gap-2.5 font-display text-xl sm:text-2xl font-bold tracking-tight text-[#F8FAFC] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] rounded"
        >
          <span
            aria-hidden="true"
            className="w-8 h-8 rounded-xl neo-icon-badge inline-flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4 text-[#E0E7FF]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M12 3L4.5 7.5v9L12 21l7.5-4.5v-9L12 3Z" />
              <path d="M12 12l7.5-4.5M12 12v9M12 12L4.5 7.5" />
            </svg>
          </span>
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
                    ? 'text-[#F8FAFC]'
                    : 'text-[#B6C2E2] hover:text-[#F8FAFC]'
                }`}
              >
                <span>{item.label}</span>
                {item.active && (
                  <motion.span
                    layoutId="header-active-nav"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-x-0 -bottom-0.5 h-[2px] rounded-full bg-gradient-to-r from-[#818CF8]/40 via-[#38BDF8] to-[#818CF8]/40 shadow-[0_0_12px_rgba(56,189,248,0.75)]"
                  />
                )}
              </button>
            ))}
          </nav>
        ) : isAdminRoute ? (
          <nav
            aria-label="Navegação exclusiva da modelo"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#B6C2E2]"
          >
            <span className="text-[#A5B4FC] whitespace-nowrap shrink-0">
              Administração Exclusiva da Modelo
            </span>
            <button
              type="button"
              onClick={() => onNavigateRoute('/')}
              className="hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Ir para Página do Internauta
            </button>
          </nav>
        ) : (
          <nav
            aria-label="Navegação institucional"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#B6C2E2]"
          >
            <a
              href="#profissionais"
              className="hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0"
            >
              Profissionais
            </a>
            <a
              href="#estudio"
              className="hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0"
            >
              O Estúdio
            </a>
            <a
              href="#experiencias"
              className="hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0"
            >
              Experiências
            </a>
            <a
              href="#galeria"
              className="hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0"
            >
              Galeria
            </a>
            <a
              href="#planos"
              className="hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0"
            >
              Planos
            </a>
          </nav>
        )}

        {/* Zone 3: Single primary action (+ admin high-contrast toggle when authenticated as model admin) */}
        <div className="flex items-center gap-2.5 shrink-0">
          {isAuthenticated && isAdmin && onToggleHighContrastAdmin && (
            <button
              type="button"
              aria-pressed={highContrastAdmin}
              onClick={onToggleHighContrastAdmin}
              title="Alternar tema de alto contraste para o painel administrativo"
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-full border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
                highContrastAdmin
                  ? 'bg-[#FDE047] border-[#FDE047] text-[#000000]'
                  : 'bg-[#0D132B] border-[#818CF8]/30 text-[#F8FAFC] hover:border-[#38BDF8]/65'
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
              className="px-4 py-2 text-xs font-medium text-[#F8FAFC] bg-[#0F1736] border border-[#818CF8]/30 rounded-full hover:bg-[#19234D] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
            >
              Sair
            </button>
          ) : (
            <button
              type="button"
              onClick={onLogin}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-full luxury-rose-cta transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
          className="md:hidden flex items-center gap-4 px-6 pb-2.5 overflow-x-auto text-xs font-medium border-t border-[#818CF8]/15 pt-2"
        >
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className={`whitespace-nowrap shrink-0 cursor-pointer ${
                item.active ? 'text-[#38BDF8]' : 'text-[#B6C2E2]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}
      <div aria-hidden="true" className="tech-ambient-layer tech-horizon-line opacity-75" />
    </header>
  );
};
