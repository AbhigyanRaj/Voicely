import React from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
  className?: string;
}

const Modal: React.FC<ModalProps> = ({ open, onClose, children, maxWidth = "max-w-sm", className }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-900/40 backdrop-blur-md min-h-screen transition-all duration-500">
      <div className={`relative bg-white/90 backdrop-blur-xl rounded-2xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] w-full ${maxWidth} mx-4 overflow-hidden animate-in zoom-in-95 fade-in duration-300 border border-white/60 ${className}`}>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-zinc-400 hover:text-zinc-700 focus:outline-none p-1.5 rounded-full hover:bg-zinc-100/50 transition-colors duration-300 z-50"
          aria-label="Close"
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        {children}
      </div>
    </div>
  );
};

export default Modal;