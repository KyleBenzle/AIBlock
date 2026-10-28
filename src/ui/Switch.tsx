export function Switch(p: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" aria-label={p.label} checked={p.checked} onChange={(e) => p.onChange(e.target.checked)} />
      <span />
    </label>
  );
}
