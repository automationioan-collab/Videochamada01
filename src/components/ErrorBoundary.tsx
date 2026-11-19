import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Ocorreu um erro inesperado no estúdio.',
    };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary capturou erro:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      let readable = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as {
          error?: string;
          operationType?: string;
          path?: string;
        };
        if (parsed.error) {
          readable = `${parsed.error} (${parsed.operationType ?? 'operação'} em ${parsed.path ?? 'dados'})`;
        }
      } catch {
        // Not JSON
      }

      return (
        <div className="min-h-screen luxury-canvas text-[#FAF4F7] flex items-center justify-center p-6">
          <div className="max-w-lg w-full luxury-card border border-[#F4C2D7]/20 rounded-2xl p-8 space-y-5">
            <h1 className="font-display text-3xl font-semibold text-[#FAF4F7]">
              Interrupção no Estúdio
            </h1>
            <p className="text-sm text-[#C9BAC4] leading-relaxed">
              Detectamos uma falha de permissão ou conexão com o banco de dados em tempo real.
            </p>
            <div className="bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl p-4 text-xs font-mono text-[#F4C2D7] break-words">
              {readable}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 text-sm font-semibold rounded-full luxury-rose-cta transition-colors cursor-pointer"
            >
              Recarregar Estúdio
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
