export function Icon({ n, fill, className = "", style }: { n: string; fill?: boolean; className?: string; style?: React.CSSProperties }) {
  return <span className={`ms${fill ? " fill" : ""}${className ? " " + className : ""}`} style={style} aria-hidden="true">{n}</span>;
}
