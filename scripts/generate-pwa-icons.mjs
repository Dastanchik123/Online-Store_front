// Иконки и splash-экраны PWA из build-resources/icon.png (тот же логотип,
// что у Electron-кассы). Результат коммитится в public/icons — запускать
// только при смене логотипа: node scripts/generate-pwa-icons.mjs
// sharp приходит зависимостью @vite-pwa/assets-generator.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appleSplashScreens } from "../pwa/apple-splash.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "build-resources/icon.png");
const outDir = join(root, "public/icons");
const BACKGROUND = "#ffffff";

await mkdir(join(outDir, "splash"), { recursive: true });

// Логотип занимает `ratio` от меньшей стороны холста, по центру, фон без
// прозрачности (iOS заливает прозрачные области apple-touch-icon чёрным).
const render = async (file, width, height, ratio) => {
  const size = Math.round(Math.min(width, height) * ratio);
  const logo = await sharp(source)
    .resize(size, size, { fit: "contain", background: BACKGROUND })
    .flatten({ background: BACKGROUND })
    .toBuffer();
  await sharp({
    create: { width, height, channels: 3, background: BACKGROUND },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(join(outDir, file));
};

await render("icon-192.png", 192, 192, 0.8);
await render("icon-512.png", 512, 512, 0.8);
// maskable: Android обрезает иконку кругом/сквирклом — логотип внутри
// безопасной зоны (центральный круг 80%), с запасом
await render("maskable-512.png", 512, 512, 0.56);
await render("apple-touch-icon-180.png", 180, 180, 0.76);

for (const s of appleSplashScreens()) {
  await render(`splash/${s.file}`, s.width, s.height, 0.28);
}

console.log("PWA-иконки записаны в", outDir);
