export default function TickerTape({ drinks }) {
  if (!drinks.length) return null;

  // The track is two identical halves and slides by exactly -50% (see CSS),
  // so each half must be wider than the screen or the tape runs out partway
  // across. Repeat the drinks until a half holds at least ~16 items.
  const copies = Math.max(1, Math.ceil(16 / drinks.length));
  const half = Array.from({ length: copies }, () => drinks).flat();
  const items = [...half, ...half];

  // Keep the scroll speed roughly constant no matter how many drinks there are.
  const duration = Math.max(30, half.length * 4);

  return (
    <div className="ticker-tape" aria-hidden="true">
      <div className="ticker-tape__track" style={{ animationDuration: `${duration}s` }}>
        {items.map((d, i) => (
          <span className="ticker-tape__item" key={`${d.id}-${i}`}>
            <span className="ticker-tape__name">{d.name.toUpperCase()}</span>
            <span className="ticker-tape__price">${d.currentPrice.toFixed(2)}</span>
            <span className={`ticker-tape__change ${d.changePct >= 0 ? "is-up" : "is-down"}`}>
              {d.changePct >= 0 ? "▲" : "▼"} {Math.abs(d.changePct)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
