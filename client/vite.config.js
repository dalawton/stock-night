import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// "/stock-night/" is the GitHub Pages subpath - only apply it to production
// builds so `npm run dev` serves at http://localhost:5173/ like the README says.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/stock-night/" : "/",
  server: { port: 5173 },
}));
