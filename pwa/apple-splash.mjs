// Splash-экраны iOS (apple-touch-startup-image): Safari показывает картинку,
// только если media-запрос совпадает с экраном устройства пиксель в пиксель,
// поэтому у каждого размера свой файл. Один список используют и генератор
// картинок (scripts/generate-pwa-icons.mjs), и <head> в nuxt.config.ts.
// [ширина CSS px, высота CSS px, devicePixelRatio, есть ли альбомная версия]
export const APPLE_SPLASH_DEVICES = [
  [375, 667, 2, false], // iPhone SE 2/3, 8
  [414, 736, 3, false], // iPhone 8 Plus
  [375, 812, 3, false], // iPhone X/XS/11 Pro/12 mini/13 mini
  [414, 896, 2, false], // iPhone XR/11
  [414, 896, 3, false], // iPhone XS Max/11 Pro Max
  [390, 844, 3, false], // iPhone 12/13/14
  [428, 926, 3, false], // iPhone 12/13 Pro Max, 14 Plus
  [393, 852, 3, false], // iPhone 14 Pro/15/16
  [430, 932, 3, false], // iPhone 14 Pro Max/15 Plus/16 Plus
  [402, 874, 3, false], // iPhone 16 Pro
  [440, 956, 3, false], // iPhone 16 Pro Max
  [744, 1133, 2, true], // iPad mini 6
  [810, 1080, 2, true], // iPad 9
  [820, 1180, 2, true], // iPad 10, Air 4/5
  [834, 1194, 2, true], // iPad Pro 11
  [1024, 1366, 2, true], // iPad Pro 12.9
];

export const appleSplashScreens = () =>
  APPLE_SPLASH_DEVICES.flatMap(([w, h, dpr, landscape]) => {
    const portrait = {
      file: `splash-${w * dpr}x${h * dpr}.png`,
      width: w * dpr,
      height: h * dpr,
      media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`,
    };
    if (!landscape) return [portrait];
    return [
      portrait,
      {
        file: `splash-${h * dpr}x${w * dpr}.png`,
        width: h * dpr,
        height: w * dpr,
        media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: landscape)`,
      },
    ];
  });
