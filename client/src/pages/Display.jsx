import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import Sparkline from "../components/Sparkline";
import TickerTape from "../components/TickerTape";

export default function Display() {
  const [drinks, setDrinks] = useState([]);
  const [histories, setHistories] = useState({});
  const [now, setNow] = useState(new Date());
  const [offline, setOffline] = useState(false);

  // A failed poll (server cold-starting, wifi blip) must not blank the TV -
  // keep showing the last good prices and just flag that we're reconnecting.
  const refresh = useCallback(async () => {
    try {
      const list = await api.listDrinks();
      const active = list.filter((d) => d.active);
      setDrinks(active);
      const all = await api.allHistory().catch(() => null);
      if (all) setHistories(all);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const dataTimer = setInterval(refresh, 4000);
    const clockTimer = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(dataTimer);
      clearInterval(clockTimer);
    };
  }, [refresh]);

  return (
    <div className="display">
      <header className="display__header">
        <div className="display__brand">
          <span className="display__brand-mark">STOCK NIGHT</span>
          <span className="display__brand-sub">live drink exchange</span>
        </div>
        <div className="display__clock">
          {offline && <span className="display__offline">reconnecting…</span>}
          {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </header>

      <TickerTape drinks={drinks} />

      <div className="board">
        {drinks.map((d) => (
          <article className={`board__card ${d.changePct >= 0 ? "is-up" : "is-down"}`} key={d.id}>
            <div className="board__row-top">
              <h2 className="board__name">{d.name}</h2>
              <span className="board__category">{d.category}</span>
            </div>
            <div className="board__price-row">
              <span className="board__price" key={d.currentPrice}>${d.currentPrice.toFixed(2)}</span>
              <span className={`board__change ${d.changePct >= 0 ? "is-up" : "is-down"}`}>
                {d.changePct >= 0 ? "▲" : "▼"} {Math.abs(d.changePct)}%
              </span>
            </div>
            <Sparkline
              history={histories[d.id]}
              fallbackPrice={d.currentPrice}
              color={d.changePct >= 0 ? "var(--up)" : "var(--down)"}
            />
          </article>
        ))}
        {drinks.length === 0 && (
          <div className="board__empty">No active drinks yet — add some from the admin dashboard.</div>
        )}
      </div>
    </div>
  );
}
