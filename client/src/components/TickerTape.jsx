export default function TickerTape({ drinks }) {
  const items = [...drinks, ...drinks]; // duplicate for seamless loop

  return (
    <div className="ticker-tape">
      <div className="ticker-tape__track">
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
