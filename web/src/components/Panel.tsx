import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}

export function Panel({ title, aside, children }: PanelProps) {
  return (
    <section className="panel">
      <div className="panel__head">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
