import React, { useRef, useEffect, useState } from 'react';

const useScrollProgress = (ref: React.RefObject<HTMLElement | null>) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      
      const totalScroll = rect.height - windowHeight;
      const currentScroll = -rect.top;
      
      let p = currentScroll / totalScroll;
      if (p < 0) p = 0;
      if (p > 1) p = 1;
      
      setProgress(p);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    handleScroll();
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [ref]);

  return progress;
};

export const ScrollAnimationSection: React.FC = () => {
  const containerRef = useRef<HTMLElement>(null);
  const progress = useScrollProgress(containerRef);

  // We use a much shorter scroll height (150vh) so it doesn't take up too much vertical space.
  // The text will smoothly slide inwards and stop.
  const easeProgress = 1 - Math.pow(1 - progress, 3); 
  // Max translation of 300px
  const xOffset = Math.max(0, (1 - easeProgress) * 300);
  
  // Center circle rotation
  const rotation = progress * 180; // half rotation

  return (
    <section ref={containerRef} className="w-full bg-white relative h-[150vh]">
      <div className="sticky top-0 h-screen w-full overflow-hidden flex flex-col items-center justify-center">
        
        <div className="relative w-full max-w-5xl mx-auto flex items-center justify-between px-8 md:px-16">
          
          {/* Left Text */}
          <div 
            className="flex-1 flex justify-end pr-12 md:pr-24 z-10"
            style={{ transform: `translateX(-${xOffset}px)` }}
          >
            <h2 className="text-4xl md:text-6xl lg:text-7xl text-[#333] tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
              Built
            </h2>
          </div>

          {/* Center Spinning Dots */}
          <div 
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 md:w-32 md:h-32 z-0"
            style={{ transform: `translate(-50%, -50%) rotate(${rotation}deg)` }}
          >
            {[...Array(8)].map((_, i) => (
              <div 
                key={i}
                className="absolute w-3.5 h-3.5 md:w-5 md:h-5 bg-[#333] rounded-full"
                style={{
                  top: '50%',
                  left: '50%',
                  marginTop: '-10px', // Half of h-5
                  marginLeft: '-10px', // Half of w-5
                  transform: `rotate(${i * 45}deg) translateY(-32px) md:translateY(-48px)`
                }}
              />
            ))}
          </div>

          {/* Right Text */}
          <div 
            className="flex-1 flex justify-start pl-12 md:pl-24 z-10"
            style={{ transform: `translateX(${xOffset}px)` }}
          >
            <h2 className="text-4xl md:text-6xl lg:text-7xl text-[#333] tracking-tight whitespace-nowrap" style={{ fontFamily: 'Georgia, serif' }}>
              to Scale.
            </h2>
          </div>
          
        </div>
      </div>
    </section>
  );
};
