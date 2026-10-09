'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[OSIRIS] ${this.props.name || 'Component'} Error:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      /* MapLibre 6 throws GPUInitializationError from its constructor when the
         browser cannot hand out a WebGL2 context (blocked hardware
         acceleration, software rendering without SwiftShader, an old GPU or
         driver). That is not a code fault — RETRY would only throw again — so
         say what to fix in plain language instead of a truncated English
         exception string. */
      const gpuError = this.state.error?.name === 'GPUInitializationError'
        || /WebGL2 is required/i.test(this.state.error?.message ?? '');
      return (
        <div className="flex items-center justify-center w-full h-full bg-[var(--bg-secondary)] rounded-lg border border-red-900/30 p-4">
          <div className="text-center">
            <div className="text-xs font-mono text-red-400 tracking-widest mb-2">
              ⚠ {this.props.name?.toUpperCase() || 'COMPONENT'} ERROR
            </div>
            {gpuError ? (
              <>
                <div className="text-[12px] font-mono text-[var(--text-secondary)] max-w-[340px] leading-relaxed">
                  Браузер не поддерживает WebGL2 — карта не может отрисоваться.
                </div>
                <div className="mt-2 text-[10.5px] font-mono text-[var(--text-muted)] max-w-[340px] leading-relaxed text-left mx-auto">
                  Что попробовать: обновить браузер до последней версии; включить
                  аппаратное ускорение в настройках и перезапустить браузер;
                  обновить драйвер видеокарты. На старых GPU или при программном
                  рендеринге WebGL2 может быть недоступен вовсе.
                </div>
              </>
            ) : (
              <div className="text-[11px] font-mono text-[var(--text-muted)] max-w-[300px] truncate">
                {this.state.error?.message}
              </div>
            )}
            <button
              onClick={() => this.setState({ hasError: false })}
              className="mt-3 px-3 py-1 text-[10px] font-mono tracking-widest text-[var(--gold-primary)] border border-[var(--border-primary)] rounded hover:bg-[var(--hover-accent)] transition-colors"
            >
              RETRY
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
