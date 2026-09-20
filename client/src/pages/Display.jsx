import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import Sparkline from "../components/Sparkline";
import TickerTape from "../components/TickerTape";
import { rtdb, firebaseConfigured } from "../firebase";

export default function Display() {
  const [drinks, setDrinks] = useState([]);
  const [histories, setHistories] = useState({});
  const [now, setNow] = useState(new Date());

  const refresh = useCallback(async () => {
    const list = await api.listDrinks();
    setDrinks(list.filter((d) => d.active));
    const entries = await Promise.all(
      list.map(async (d) => [d.id, await api.history(d.id)])
    );
    setHistories(Object.fromEntries(entries));
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
        <div className="display__clock">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
      </header>

      <TickerTape drinks={drinks} />

      <div className="board">
        {drinks.map((d) => (
          <article className="board__card" key={d.id}>
            <div className="board__row-top">
              <h2 className="board__name">{d.name}</h2>
              <span className="board__category">{d.category}</span>
            </div>
            <div className="board__price-row">
              <span className="board__price">${d.currentPrice.toFixed(2)}</span>
              <span className={`board__change ${d.changePct >= 0 ? "is-up" : "is-down"}`}>
                {d.changePct >= 0 ? "▲" : "▼"} {Math.abs(d.changePct)}%
              </span>
            </div>
            <Sparkline
              history={histories[d.id]}
              width={220}
              height={48}
              color={d.changePct >= 0 ? "var(--up)" : "var(--down)"}
            />
            <div className="board__floor">floor ${Math.max(d.listPrice * 0.5, d.wholesalePrice || 0).toFixed(2)}</div>
          </article>
        ))}
        {drinks.length === 0 && (
          <div className="board__empty">No active drinks yet — add some from the admin dashboard.</div>
        )}
      </div>
    </div>
  );
}
