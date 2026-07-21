import React from 'react';

interface PageTransitionProps {
  children: React.ReactNode;
  routeKey: string;
}

export function PageTransition({ children, routeKey }: PageTransitionProps) {
  return <div key={routeKey}>{children}</div>;
}

