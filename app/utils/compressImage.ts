// Уменьшает фото перед загрузкой: длинная сторона — не больше maxSide.
// Фото с телефона (12+ Мп) бэкенд целиком декодирует в память (~100–150 МБ
// на один файл) — на маленькой машине Fly php-fpm убивался по OOM и запрос
// падал с 502. После сжатия в браузере на сервер уходит несколько сотен КБ.
// При любой ошибке возвращается исходный файл — сервер всё равно сам
// ужмёт его до тех же размеров (ProductController::storeImage).

const MAX_SIDE = 1600;
const QUALITY = 0.85;
const SKIP_BELOW_BYTES = 500 * 1024;

export async function compressImage(
  file: File,
  maxSide = MAX_SIDE,
  quality = QUALITY,
): Promise<File> {
  if (!import.meta.client || !file?.type?.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));

    if (scale === 1 && file.size <= SKIP_BELOW_BYTES) {
      bitmap.close();
      return file;
    }

    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    // Браузер без webp-энкодера молча отдаёт png — тогда лучше jpeg
    const result =
      blob && blob.type === "image/webp"
        ? blob
        : await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", quality),
          );

    if (!result || result.size >= file.size) return file;

    const ext = result.type === "image/webp" ? "webp" : "jpg";
    const name = file.name.replace(/\.[^.]+$/, "") + "." + ext;
    return new File([result], name, { type: result.type });
  } catch {
    return file;
  }
}
