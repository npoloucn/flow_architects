import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages: el repo `npoloucn/flow_architects` es un "project page" y la app
// se sirve bajo /flow_architects/. En desarrollo local, en cambio, se queda en "/"
// para que `npm run dev` abra en http://localhost:5173/ sin subcarpeta.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/flow_architects/" : "/",
  plugins: [react()],
  server: { port: 5173 },
}));
