import React from 'react';
import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';

const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center relative overflow-hidden px-4">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-blue-500/[0.03] rounded-full blur-[120px] pointer-events-none"></div>

      <div className="relative z-10 flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
        <h1 className="text-[120px] font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-white to-white/20 leading-none tracking-tighter mb-4 select-none drop-shadow-2xl">
          404
        </h1>
        
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] backdrop-blur-md mb-6">
          <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></div>
          <span className="text-xs font-medium tracking-wide text-zinc-300">Page not found</span>
        </div>
        
        <p className="text-zinc-400 max-w-sm mb-10 text-sm">
          The page you're looking for doesn't exist, has been moved, or is currently unavailable.
        </p>
        
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            onClick={() => window.history.back()}
            className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 h-10 px-6 rounded-xl"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
          
          <Link to="/">
            <Button className="bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 h-10 px-6 rounded-xl">
              <Home className="w-4 h-4 mr-2" />
              Return Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
