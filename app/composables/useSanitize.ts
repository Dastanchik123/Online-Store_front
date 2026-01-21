export const useSanitize = () => {
  
  const sanitizeHtml = (html: string): string => {
    if (!html) return "";
    const div = document.createElement("div");
    div.textContent = html;
    return div.innerHTML;
  };

  
  const escapeHtml = (text: string): string => {
    if (!text) return "";
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
      "/": "&#x2F;",
    };
    return text.replace(/[&<>"'/]/g, (m) => map[m]);
  };

  
  const stripHtml = (html: string): string => {
    if (!html) return "";
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  };

  
  const sanitizeUrl = (url: string): string => {
    if (!url) return "";

    // Remove javascript: and data: protocols
    if (url.match(/^(javascript|data|vbscript):/i)) {
      return "";
    }

    // Only allow http, https, mailto, tel
    if (!url.match(/^(https?:\/\/|mailto:|tel:|\/)/i)) {
      return "";
    }

    return url;
  };

  
  const sanitizeFileName = (fileName: string): string => {
    if (!fileName) return "";

    // Remove path traversal attempts
    fileName = fileName.replace(/\.\./g, "");

    // Remove special characters
    fileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

    return fileName;
  };

  
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  
  const isValidPhone = (phone: string): boolean => {
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    return phoneRegex.test(phone) && phone.replace(/\D/g, "").length >= 10;
  };

  
  const sanitizeInput = (input: string): string => {
    if (!input) return "";

    // Remove SQL injection attempts
    const dangerous = [
      "--",
      ";",
      "",
      "xp_",
      "sp_",
      "exec",
      "execute",
      "script",
    ];
    let sanitized = input;

    dangerous.forEach((pattern) => {
      sanitized = sanitized.replace(new RegExp(pattern, "gi"), "");
    });

    return sanitized.trim();
  };

  return {
    sanitizeHtml,
    escapeHtml,
    stripHtml,
    sanitizeUrl,
    sanitizeFileName,
    isValidEmail,
    isValidPhone,
    sanitizeInput,
  };
};
