import React from 'react';

export type WorkspaceTab = 'studio' | 'call' | 'users' | 'queue';

interface HeaderProps {
  isAuthenticated: boolean;
  isAdmin: boolean;
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onLogin: () => void;
  onLogout: () => void;
  userDisplayName?: string;
}

export const Header: React.FC<HeaderProps> = ({
  isAuthenticated,
  isAdmin,
  activeTab,
  onSelectTab,
  onLogin,
  onLogout,
}) => {
  const navItems: Array<{ id: WorkspaceTab; label: string }> = isAuthenticated
    ? isAdmin
      ? [
          { id: 'studio', label: 'Estúdio' },
          { id: 'call', label: 'Videochamada' },
          { id: 'users', label: 'Usuários' },
          { id: 'queue', label: 'Fila' },
        ]
      : [
          { id: 'studio', label: 'Estúdio' },
          { id: 'call', label: 'Videochamada' },
          { id: 'queue', label: 'Minha Fila' },
        ]
    : [];

  return (
    <header className="sticky top-0 z-30 bg-[#0B0C0F]/95 backdrop-blur-sm border-b border-white/10">
      <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('studio')}
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
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b ${
                    active
                      ? 'text-[#F3EFE6] border-[#C9A46B]'
                      : 'text-[#9BA1AE] border-transparent hover:text-[#F3EFE6]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        ) : (
          <nav
            aria-label="Navegação institucional"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#9BA1AE]"
          >
            <a
              href="#estudio"
              className="hover:text-[#F3EFE6] transition-colors whitespace-nowrap shrink-0"
            >
              O Estúdio
            </a>
            <a
              href="#recursos"
              className="hover:text-[#F3EFE6] transition-colors whitespace-nowrap shrink-0"
            >
              Como Funciona
            </a>
            <a
              href="#privacidade"
              className="hover:text-[#F3EFE6] transition-colors whitespace-nowrap shrink-0"
            >
              Privacidade
            </a>
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
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`whitespace-nowrap shrink-0 cursor-pointer ${
                  active ? 'text-[#C9A46B]' : 'text-[#9BA1AE]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      )}
    </header>
  );
};
