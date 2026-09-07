import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    server: {
        host: "127.0.0.1",
        port: 5173,
        // Proxying keeps the browser same-origin, so no CORS and no token ids in query logs.
        proxy: {
            "/api": {
                target: process.env.API_URL ?? "http://127.0.0.1:4000",
                changeOrigin: true
            }
        }
    }
});
