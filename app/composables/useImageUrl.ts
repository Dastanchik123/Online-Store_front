export const useImageUrl = () => {
  const config = useRuntimeConfig();

  const getImageUrl = (imagePath: string | null | undefined): string => {
    if (!imagePath) return "";
    if (typeof imagePath !== "string") return "";

    // If it's already a full URL and not localhost, return as is
    if (
      imagePath.startsWith("http") &&
      !imagePath.includes("localhost") &&
      !imagePath.includes("127.0.0.1")
    ) {
      return imagePath;
    }

    // Get base URL from config
    const baseUrl = config.public.apiBase.replace(/\/api$/, "");

    // Extract path from URL if needed
    let path = imagePath;
    if (imagePath.startsWith("http")) {
      try {
        const urlObj = new URL(imagePath);
        path = urlObj.pathname;
      } catch (e) {
        console.error("Invalid URL:", imagePath);
        return "";
      }
    }

    // Ensure path starts with /storage
    if (!path.startsWith("/storage") && !path.startsWith("storage")) {
      path = "storage/" + (path.startsWith("/") ? path.substring(1) : path);
    }

    // Ensure path starts with /
    const finalPath = path.startsWith("/") ? path : "/" + path;

    return `${baseUrl}${finalPath}`;
  };

  const getStorageUrl = (relativePath: string | null | undefined): string => {
    if (!relativePath) return "";

    const baseUrl = config.public.apiBase.replace(/\/api$/, "");
    const cleanPath = relativePath.startsWith("/")
      ? relativePath
      : "/" + relativePath;

    return `${baseUrl}/storage${cleanPath}`;
  };

  return {
    getImageUrl,
    getStorageUrl,
  };
};
