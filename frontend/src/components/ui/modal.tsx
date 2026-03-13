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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md min-h-screen">
      <div className={`relative bg-zinc-900 rounded-[2rem] shadow-2xl w-full ${maxWidth} mx-4 overflow-hidden animate-fade-in border border-white/5 ${className}`}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white focus:outline-none p-2 rounded-full hover:bg-white/5 transition-all z-50"
          aria-label="Close"
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        {children}
      </div>
    </div>
  );
};

export default Modal;