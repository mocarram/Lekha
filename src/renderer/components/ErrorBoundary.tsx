/**
 * ErrorBoundary - last-resort recovery UI for uncaught render errors.
 *
 * React error boundaries must be class components: there is no hook equivalent
 * for getDerivedStateFromError / componentDidCatch. When a child throws during
 * render, we swap the tree for a minimal recovery panel (a message + a Reload
 * button) instead of letting React unmount everything and leave a blank window.
 * The error is logged so it is not swallowed silently.
 *
 * Styling is theme-token based (no hardcoded colors) so the fallback respects
 * whatever theme is active when the crash happens.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the failure - otherwise a render crash leaves no trace.
    console.error('Unhandled render error:', error, info.componentStack)
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        role="alert"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          height: '100vh',
          padding: '24px',
          textAlign: 'center',
          background: 'var(--bg)',
          color: 'var(--text)',
          fontFamily: 'var(--font-ui)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
          Something went wrong
        </h1>
        <p style={{ margin: 0, maxWidth: '440px', color: 'var(--text-muted)' }}>
          Lekha hit an unexpected error and could not continue. Your work may be
          recoverable from a crash backup on the next launch. Reload to try
          again.
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          style={{
            cursor: 'pointer',
            padding: '8px 18px',
            fontFamily: 'var(--font-ui)',
            fontSize: '13px',
            color: 'var(--bg)',
            background: 'var(--accent)',
            border: '1px solid var(--accent)',
            borderRadius: '6px',
          }}
        >
          Reload
        </button>
      </div>
    )
  }
}

export default ErrorBoundary
