import React from 'react';

export type WorkspaceTab = 'studio' | 'call' | 'users' | 'queue' | 'admin';

interface HeaderProps {
  isAuthenticated: boolean;
  isAdmin: boolean;
  isAdminRoute: boolean;
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onNavigateRoute: (path: '/' | '/admin') => void;
  onLogin: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isAuthenticated,
  isAdmin,
  isAdminRoute,
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
    <header className="sticky top-0 z-30 bg-[#0B0C0F]/95 backdrop-blur-sm border-b border-white/10">
      <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => {
            onNavigateRoute('/');
            onSelectTab('studio');
          }}
          className="font-display text-2xl font-semibold tracking-tight text-[#F3EFE6] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A46B] rounded"
        >
          Maison Aura
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
                className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b ${
                  item.active
                    ? 'text-[#F3EFE6] border-[#C9A46B]'
                    : 'text-[#9BA1AE] border-transparent hover:text-[#F3EFE6]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        ) : (
          <nav
            aria-label="Navegação institucional"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#9BA1AE]"
          >
            <a
              href="#estudio"
              onClick={() => {
                if (isAdminRoute) onNavigateRoute('/');
              }}
              className="hover:text-[#F3EFE6] transition-colors whitespace-nowrap shrink-0"
            >
              O Estúdio
            </a>
            <a
              href="#galeria"
              onClick={() => {
                if (isAdminRoute) onNavigateRoute('/');
              }}
              className="hover:text-[#F3EFE6] transition-colors whitespace-nowrap shrink-0"
            >
              Galeria
            </a>
            <a
              href="#recursos"
              onClick={() => {
                if (isAdminRoute) onNavigateRoute('/');
              }}
              className="hover:text-[#F3EFE6] transition-colors whitespace-nowrap shrink-0"
            >
              Como Funciona
            </a>
            <button
              type="button"
              onClick={() => onNavigateRoute(isAdminRoute ? '/' : '/admin')}
              className={`hover:text-[#F3EFE6] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isAdminRoute ? 'text-[#C9A46B]' : ''
              }`}
            >
              {isAdminRoute ? 'Área do Internauta' : 'Área da Modelo'}
            </button>
          </nav>
        )}

        {/* Zone 3: Single primary action */}
        <div className="flex items-center shrink-0">
          {isAuthenticated ? (
            <button
              type="button"
              onClick={onLogout}
              className="px-4 py-2 text-xs font-medium text-[#F3EFE6] bg-[#161920] border border-white/15 rounded-lg hover:bg-[#1F232C] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A46B]"
            >
              Sair
            </button>
          ) : (
            <button
              type="button"
              onClick={onLogin}
              className="px-4 py-2 text-xs font-semibold text-[#0B0C0F] bg-[#C9A46B] rounded-lg hover:bg-[#D7B57E] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3EFE6]"
            >
              Entrar com Google
            </button>
          )}
        </div>
      </div>

      {/* Mobile compact nav row when authenticated */}
      {isAuthenticated && (
        <nav
          aria-label="Navegação móvel"
          className="md:hidden flex items-center gap-4 px-6 pb-2.5 overflow-x-auto text-xs font-medium border-t border-white/5 pt-2"
        >
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className={`whitespace-nowrap shrink-0 cursor-pointer ${
                item.active ? 'text-[#C9A46B]' : 'text-[#9BA1AE]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}
    </header>
  );
};
