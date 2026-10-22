import { defineConfig } from "vite";
import { voidPlugin } from "void";

export default defineConfig({
  plugins: [voidPlugin()],
  server: {
    host: '0.0.0.0',
    port: 8000,
    strictPort: true,
  },
});
