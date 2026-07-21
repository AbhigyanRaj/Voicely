import React from 'react';
import { Link } from 'react-router-dom';
import { Github, Twitter, Linkedin } from 'lucide-react';

export const FooterSection: React.FC = () => {
  return (
    <footer className="bg-white text-zinc-900 pt-16 pb-8 px-6 lg:px-20 border-t border-zinc-200">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between gap-12 mb-16">
          
          <div className="max-w-sm">
            <Link to="/" className="flex items-center gap-2 mb-6">
              <span className="text-xl font-bold tracking-tight text-zinc-900">Voicely</span>
            </Link>
            <p className="text-zinc-500 mb-8 leading-relaxed">
              The human-standard AI voice agent for businesses. Automate support, scale sales, and streamline operations.
            </p>
            <div className="flex gap-4">
              <a href="#" className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center hover:bg-zinc-200 transition-colors text-zinc-600">
                <Twitter className="w-4 h-4" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center hover:bg-zinc-200 transition-colors text-zinc-600">
                <Linkedin className="w-4 h-4" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center hover:bg-zinc-200 transition-colors text-zinc-600">
                <Github className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div className="flex gap-16 lg:gap-24">
            <div>
              <h4 className="font-semibold text-zinc-900 mb-6 tracking-tight">Platform</h4>
              <ul className="flex flex-col gap-4 text-zinc-500 text-sm">
                <li><Link to="/developer/docs" className="hover:text-blue-600 transition-colors">Documentation</Link></li>
                <li><a href="#" className="hover:text-blue-600 transition-colors">API Reference</a></li>
                <li><a href="#" className="hover:text-blue-600 transition-colors">Pricing</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-zinc-900 mb-6 tracking-tight">Company</h4>
              <ul className="flex flex-col gap-4 text-zinc-500 text-sm">
                <li><a href="#" className="hover:text-blue-600 transition-colors">About</a></li>
                <li><a href="#" className="hover:text-blue-600 transition-colors">Contact</a></li>
                <li><a href="#" className="hover:text-blue-600 transition-colors">Privacy & Terms</a></li>
              </ul>
            </div>
          </div>

        </div>

        <div className="border-t border-zinc-200 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-zinc-400 text-sm">
          <p>© 2026 Voicely AI. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-zinc-600 transition-colors">Status</a>
            <a href="#" className="hover:text-zinc-600 transition-colors">Security</a>
          </div>
        </div>
      </div>
    </footer>
  );
};
