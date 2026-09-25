import type { ReactNode } from "react";

interface Props {
  step: string;
  title: string;
  children: ReactNode;
  index?: number; // for staggered directional reveal
}

export function Card({ step, title, children, index = 0 }: Props) {
  return (
    <div className="card" style={{ animationDelay: `${index * 70}ms` }}>
      <span className="step">{step}</span>
      <h3>{title}</h3>
      {children}
    </div>
  );
}
