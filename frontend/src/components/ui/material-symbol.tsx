import React from 'react';

interface MaterialSymbolProps extends React.HTMLAttributes<HTMLSpanElement> {
  icon: string;
  className?: string;
}

export function MaterialSymbol({ icon, className = '', ...props }: MaterialSymbolProps) {
  return (
    <span className={`material-symbols-outlined ${className}`} {...props}>
      {icon}
    </span>
  );
}
