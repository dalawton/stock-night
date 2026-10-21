const DECAY_INTERVAL_MS = Number(process.env.DECAY_INTERVAL_MS ?? 30000);

export function startDecayLoop(getStore) {
  let running = false;

  setInterval(async () => {
    if (running) return; // previous tick still in flight (slow network) - skip
    running = true;
    try {
      const store = await getStore();
      const drinks = await store.listDrinks();
      for (const drink of drinks) {
        try {
          // applyDecay does its own "already at rest / inactive" checks and,
          // on Firebase, runs inside a transaction so it can't clobber a sale.
          await store.applyDecay(drink.id);
        } catch (err) {
          console.error(`[decay] failed for ${drink.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error("[decay] tick failed:", err.message);
    } finally {
      running = false;
    }
  }, DECAY_INTERVAL_MS);

  console.log(`[decay] running every ${DECAY_INTERVAL_MS / 1000}s`);
}
