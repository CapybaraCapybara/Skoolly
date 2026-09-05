import React, { Component, ErrorInfo, ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

interface Props {
  children?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught React error:', error, errorInfo)
    this.setState({ error, errorInfo })
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif', background: '#fff5f5', color: '#991b1b', minHeight: '100vh' }}>
          <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 12 }}>⚠️ Application Render Error</h1>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{this.state.error?.message}</p>
          <pre style={{ background: '#fee2e2', padding: 16, borderRadius: 8, overflowX: 'auto', fontSize: 13, lineHeight: 1.5, color: '#7f1d1d' }}>
            {this.state.error?.stack}
          </pre>
          {this.state.errorInfo && (
            <pre style={{ background: '#fef2f2', padding: 16, borderRadius: 8, overflowX: 'auto', fontSize: 12, marginTop: 16 }}>
              {this.state.errorInfo.componentStack}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 20, padding: '10px 20px', borderRadius: 8, background: '#991b1b', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
