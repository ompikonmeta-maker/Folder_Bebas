import type { LibraryAsset } from "../types";

interface Props {
  label: string;
  assets: LibraryAsset[];
  selected: number | null;
  onSelect: (id: number | null) => void;
  onImport: () => void;
  onDelete: (id: number) => void;
}

export function AssetPicker({ label, assets, selected, onSelect, onImport, onDelete }: Props) {
  return (
    <div className="picker">
      <div className="picker-head">
        <span>{label}</span>
        <button className="mini format" title={`Import ${label.toLowerCase()}`} onClick={onImport}>
          ＋
        </button>
      </div>
      <div className="chips">
        <span className={"chip" + (selected === null ? " on" : "")} onClick={() => onSelect(null)}>
          None
        </span>
        {assets.map((a) => (
          <span
            key={a.id}
            className={"chip" + (selected === a.id ? " on" : "")}
            onClick={() => onSelect(a.id)}
            onDoubleClick={() => onDelete(a.id)}
            title={`${a.name} — double-click to remove`}
          >
            {a.name}
          </span>
        ))}
      </div>
    </div>
  );
}
