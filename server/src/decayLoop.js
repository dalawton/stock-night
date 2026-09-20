import { applyDecayTick } from "./pricingEngine.js";

const DECAY_INTERVAL_MS = Number(process.env.DECAY_INTERVAL_MS ?? 30000);

export function startDecayLoop(getStore) {
  setInterval(async () => {
    const store = await getStore();
    const drinks = await store.listDrinks();
    for (const drink of drinks) {
      if (!drink.active) continue;
      if (Math.abs(drink.currentPrice - drink.listPrice) < 0.01) continue; // already at rest
      const { price, cause } = applyDecayTick(drink);
      if (price !== drink.currentPrice) {
        await store.updateDrinkPrice(drink.id, { price, cause });
      }
    }
  }, DECAY_INTERVAL_MS);

  console.log(`[decay] running every ${DECAY_INTERVAL_MS / 1000}s`);
}
