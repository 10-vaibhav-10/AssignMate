import { Component, type ReactNode } from 'react';

interface Props  { children: ReactNode }
interface State  { hasError: boolean; message: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  handleReload() {
    window.location.reload();
  }

  handleReset() {
    this.setState({ hasError: false, message: '' });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
        style={{ background: 'linear-gradient(160deg, #ede8ff 0%, #f5f2ff 40%, #faf8ff 100%)' }}>
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5 shadow-xl shadow-rose-400/25"
          style={{ background: 'linear-gradient(135deg, #e11d48, #f43f5e, #fb7185)' }}
        >
          <span className="text-4xl">⚠️</span>
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">Something went wrong</h1>
        <p className="text-sm text-gray-500 mb-1 max-w-xs leading-relaxed">
          An unexpected error occurred. Your data is safe in localStorage.
        </p>
        {this.state.message && (
          <p className="text-xs text-gray-400 bg-gray-100 px-3 py-2 rounded-xl mb-6 max-w-xs font-mono break-all">
            {this.state.message}
          </p>
        )}
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={this.handleReload}
            className="py-3.5 rounded-2xl font-black text-sm text-white shadow-lg shadow-violet-400/30"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7, #d946ef)' }}
          >
            Reload App
          </button>
          <button
            onClick={() => this.handleReset()}
            className="py-3.5 rounded-2xl font-bold text-sm text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-colors"
          >
            Try to Recover
          </button>
        </div>
      </div>
    );
  }
}
