import tailwindcss from "@tailwindcss/vite";
import { elysionPlugin } from "@teyik0/elysion/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [elysionPlugin({ pagesDir: "./src/pages" }), react(), tailwindcss(), tsConfigPaths()],
});
