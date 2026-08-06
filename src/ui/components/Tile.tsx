interface Props {
  label: string;
  value: string | number;
}

/** A stat tile: label plus value. Lifted out of Dashboard so any surface can use it. */
export function Tile({ label, value }: Props) {
  return (
    <div className="tile surface">
      <span className="tile-value">{value}</span>
      <span className="tile-label muted">{label}</span>
    </div>
  );
}
