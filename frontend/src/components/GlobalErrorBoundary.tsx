import React from 'react';

export const GlobalErrorFallback: React.FC<{ error: Error; resetErrorBoundary: () => void }> = ({ error, resetErrorBoundary }) => {
  return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#09090b] border border-red-500/20 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white">Something went wrong</h2>
        </div>
        
        <div className="bg-black/50 rounded-lg p-4 mb-6 overflow-auto max-h-48 border border-white/[0.05]">
          <pre className="text-red-400 text-sm font-mono whitespace-pre-wrap break-words">
            {error.message}
          </pre>
        </div>

        <div className="flex gap-3">
          <button
            onClick={resetErrorBoundary}
            className="flex-1 bg-white hover:bg-zinc-200 text-black font-semibold py-2.5 px-4 rounded-xl transition-colors"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2.5 px-4 rounded-xl transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    </div>
  );
};
