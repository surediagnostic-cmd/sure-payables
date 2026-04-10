export default function DownloadMenu({ items = [] }) {
  return (
    <div className="dl-wrap">
      <button className="btn btn-green">⬇ Export</button>
      <div className="dl-menu">
        {items.map((item, i) =>
          item === 'sep'
            ? <div key={i} className="dl-sep" />
            : <div key={i} className="dl-item" onClick={item.fn}>{item.label}</div>
        )}
        <div className="dl-sep" />
        <div className="dl-item" onClick={() => window.print()}>🖨️ Print / PDF</div>
      </div>
    </div>
  )
}
