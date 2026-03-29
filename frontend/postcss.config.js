import path from "node:path";
import { fileURLToPath } from "node:url";
import autoprefixer from "autoprefixer";
import tailwindPostcss from "@tailwindcss/postcss";

const configDir = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: [
    tailwindPostcss({
      config: path.resolve(configDir, "tailwind.config.js")
    }),
    autoprefixer()
  ]
};
