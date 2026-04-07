import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      let errorMessage = "Ocurrió un error inesperado en la aplicación.";
      
      try {
        // Check if it's an API JSON error
        if (this.state.error?.message.startsWith('{')) {
          const errData = JSON.parse(this.state.error.message);
          errorMessage = `Error de base de datos (${errData.operationType}): ${errData.error}`;
        }
      } catch (e) {
        // Fallback to default message
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-slate-100">
            <div className="w-20 h-20 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="text-rose-500" size={40} />
            </div>
            
            <h1 className="text-2xl font-bold text-slate-900 mb-2">¡Ups! Algo salió mal</h1>
            <p className="text-slate-500 mb-8">
              {errorMessage}
            </p>

            <div className="space-y-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full flex items-center justify-center gap-2 bg-primary text-white font-bold py-3 px-4 rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow"
              >
                <RefreshCw size={18} />
                Recargar Aplicación
              </button>
              
              <button
                onClick={this.handleReset}
                className="w-full flex items-center justify-center gap-2 bg-slate-100 text-slate-700 font-bold py-3 px-4 rounded-xl hover:bg-slate-200 transition-all"
              >
                <Home size={18} />
                Volver al Inicio
              </button>
            </div>

            <div className="mt-8 p-4 bg-slate-50 rounded-xl text-left">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Detalles Técnicos</p>
              <p className="text-[10px] font-mono text-slate-500 break-all">
                {this.state.error?.message || "Error desconocido"}
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
