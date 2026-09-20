import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../authContext";

export default function Admin() {
  const { role, firebaseConfigured } = useAuth();
  const isManager = !firebaseConfigured || role === "manager"; // dev bypass = manager
  const [drinks, setDrinks] = useState([]);
  const [audit, setAudit] = useState([]);
  const [form, setForm] = useState({ name: "", category: "", listPrice: "", wholesalePrice: "" });
  const [editingId, setEditingId] = useState(null);
  const [editListPrice, setEditListPrice] = useState("");
  const [editWholesalePrice, setEditWholesalePrice] = useState("");
  const [editReason, setEditReason] = useState("");
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);

  const refresh = useCallback(async () => {
    const list = await api.listDrinks();
    setDrinks(list);
    if (isManager) {
      try {
        setAudit(await api.auditLog(50));
      } catch {
        setAudit([]); // not a manager after all, or not signed in yet
      }
    }
  }, [isManager]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  async function handleAddDrink(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.createDrink({
        name: form.name,
        category: form.category,
        listPrice: parseFloat(form.listPrice),
        wholesalePrice: form.wholesalePrice ? parseFloat(form.wholesalePrice) : undefined,
      });
      setForm({ name: "", category: "", listPrice: "", wholesalePrice: "" });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSale(id) {
    setError(null);
    try {
      await api.recordSale(id);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleReset(id) {
    await api.reset(id);
    refresh();
  }

  async function handleToggleActive(drink) {
    await api.setActive(drink.id, !drink.active);
    refresh();
  }

  async function handleDelete(id) {
    if (!confirm("Remove this drink permanently?")) return;
    await api.deleteDrink(id);
    refresh();
  }

  function startEdit(drink) {
    setEditingId(drink.id);
    setEditListPrice(drink.listPrice);
    setEditWholesalePrice(drink.wholesalePrice || 0);
    setEditReason("");
    setWarning(null);
  }

  async function submitEdit(id) {
    setError(null);
    try {
      const res = await api.setPricing(
        id,
        { listPrice: parseFloat(editListPrice), wholesalePrice: parseFloat(editWholesalePrice) },
        editReason
      );
      setWarning(res.warning || null);
      setEditingId(null);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="admin">
      <header className="admin__header">
        <h1>Stock Night — Admin</h1>
        <p className="admin__subtitle">
          Tap "Sold one" each time a drink is rung up on the real POS. Prices here are for the
          board only and never charge anyone.
        </p>
      </header>

      {error && <div className="banner banner--error">{error}</div>}
      {warning && <div className="banner banner--warning">{warning}</div>}

      {isManager && (
        <section className="panel">
          <h2>Add a drink</h2>
          <form className="add-form" onSubmit={handleAddDrink}>
            <input
              placeholder="Name (e.g. Old Fashioned)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <input
              placeholder="Category (e.g. cocktail)"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
            <input
              type="number"
              step="0.25"
              min="0"
              placeholder="List price ($)"
              value={form.listPrice}
              onChange={(e) => setForm({ ...form, listPrice: e.target.value })}
              required
            />
            <input
              type="number"
              step="0.25"
              min="0"
              placeholder="Wholesale cost ($, optional)"
              value={form.wholesalePrice}
              onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })}
            />
            <button type="submit">Add drink</button>
          </form>
        </section>
      )}

      <section className="panel">
        <h2>Drinks</h2>
        <table className="drink-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>List</th>
              <th>Wholesale</th>
              <th>Current</th>
              <th>Floor</th>
              <th>Change</th>
              <th>Sales</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {drinks.map((d) => (
              <tr key={d.id} className={!d.active ? "is-inactive" : ""}>
                <td>{d.name}</td>
                {editingId === d.id ? (
                  <td colSpan={2}>
                    <div className="edit-price">
                      <input
                        type="number"
                        step="0.25"
                        placeholder="List"
                        value={editListPrice}
                        onChange={(e) => setEditListPrice(e.target.value)}
                      />
                      <input
                        type="number"
                        step="0.25"
                        placeholder="Wholesale"
                        value={editWholesalePrice}
                        onChange={(e) => setEditWholesalePrice(e.target.value)}
                      />
                      <input
                        placeholder="reason (required, logged)"
                        value={editReason}
                        onChange={(e) => setEditReason(e.target.value)}
                      />
                      <button onClick={() => submitEdit(d.id)}>Save</button>
                      <button className="btn-ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </td>
                ) : (
                  <>
                    <td>
                      {isManager ? (
                        <button className="btn-ghost" onClick={() => startEdit(d)}>
                          ${d.listPrice.toFixed(2)}
                        </button>
                      ) : (
                        <span>${d.listPrice.toFixed(2)}</span>
                      )}
                    </td>
                    <td>{d.wholesalePrice ? `$${d.wholesalePrice.toFixed(2)}` : "—"}</td>
                  </>
                )}
                <td>${d.currentPrice.toFixed(2)}</td>
                <td title={d.wholesalePrice > d.listPrice * 0.5 ? "cost floor" : "50% legal floor"}>
                  ${Math.max(d.listPrice * 0.5, d.wholesalePrice || 0).toFixed(2)}
                </td>
                <td className={d.changePct >= 0 ? "is-up" : "is-down"}>
                  {d.changePct >= 0 ? "▲" : "▼"} {Math.abs(d.changePct)}%
                </td>
                <td>{d.salesCount}</td>
                <td>{d.active ? "live" : "86'd"}</td>
                <td className="row-actions">
                  <button onClick={() => handleSale(d.id)} disabled={!d.active}>
                    Sold one
                  </button>
                  {isManager && (
                    <>
                      <button className="btn-ghost" onClick={() => handleReset(d.id)}>
                        Reset
                      </button>
                      <button className="btn-ghost" onClick={() => handleToggleActive(d)}>
                        {d.active ? "86 it" : "Bring back"}
                      </button>
                      <button className="btn-ghost btn-danger" onClick={() => handleDelete(d.id)}>
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {drinks.length === 0 && (
              <tr>
                <td colSpan={9} className="empty-row">
                  No drinks yet — add one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {isManager && (
      <section className="panel">
        <h2>Audit log</h2>
        <p className="admin__subtitle">Every price movement and admin action, most recent first.</p>
        <ul className="audit-list">
          {audit.map((entry, i) => (
            <li key={i} className="audit-list__item">
              <span className="audit-list__time">{new Date(entry.ts).toLocaleTimeString()}</span>
              <span className="audit-list__type">{entry.type}</span>
              <span className="audit-list__detail">{describeAudit(entry)}</span>
            </li>
          ))}
          {audit.length === 0 && <li className="empty-row">No activity yet.</li>}
        </ul>
      </section>
      )}
    </div>
  );
}

function describeAudit(entry) {
  switch (entry.type) {
    case "pricing_change": {
      const parts = [];
      if (entry.oldListPrice !== entry.newListPrice) {
        parts.push(`list $${entry.oldListPrice} → $${entry.newListPrice}`);
      }
      if (entry.oldWholesalePrice !== entry.newWholesalePrice) {
        parts.push(`wholesale $${entry.oldWholesalePrice} → $${entry.newWholesalePrice}`);
      }
      return `${entry.name}: ${parts.join(", ")} (${entry.reason})`;
    }
    case "price_sale":
      return `${entry.name}: sale recorded, now $${entry.price}`;
    case "price_decay":
      return `${entry.name}: decayed to $${entry.price}`;
    case "price_reset":
      return `${entry.name}: reset to $${entry.price}`;
    case "create_drink":
      return `${entry.name} added at $${entry.listPrice}${entry.wholesalePrice ? ` (wholesale $${entry.wholesalePrice})` : ""}`;
    case "deactivate_drink":
      return `${entry.name} marked 86'd`;
    case "activate_drink":
      return `${entry.name} brought back`;
    case "delete_drink":
      return `${entry.name} removed`;
    default:
      return "";
  }
}