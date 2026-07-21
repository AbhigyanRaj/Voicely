import React from 'react';
import { Loader2 } from 'lucide-react';

const PageLoader: React.FC = () => {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center">
      <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
    </div>
  );
};

export default PageLoader;
