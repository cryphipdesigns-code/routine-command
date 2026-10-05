const CHUNK_SIZE = 2800;
const COOKIE_LIFETIME_SECONDS = 60 * 60 * 24 * 365;
const COUNT_SUFFIX = "__routine_chunks";

export class CookieAuthStorage {
  private readonly path = import.meta.env.BASE_URL || "/";

  getItem(key: string): string | null {
    const count = Number(this.readCookie(`${key}${COUNT_SUFFIX}`));
    if (Number.isInteger(count) && count > 0) {
      const encoded = Array.from({ length: count }, (_, index) =>
        this.readCookie(`${key}${COUNT_SUFFIX}_${index}`),
      ).join("");
      if (encoded) return safelyDecode(encoded);
    }

    const single = this.readCookie(key);
    if (single) return safelyDecode(single);

    const legacy = localStorage.getItem(key);
    if (legacy) {
      this.setItem(key, legacy);
      return legacy;
    }
    return null;
  }

  setItem(key: string, value: string): void {
    this.clearCookies(key);
    const encoded = encodeURIComponent(value);
    const chunks = encoded.match(new RegExp(`.{1,${CHUNK_SIZE}}`, "g")) ?? [""];
    chunks.forEach((chunk, index) => {
      this.writeCookie(`${key}${COUNT_SUFFIX}_${index}`, chunk, COOKIE_LIFETIME_SECONDS);
    });
    this.writeCookie(`${key}${COUNT_SUFFIX}`, String(chunks.length), COOKIE_LIFETIME_SECONDS);
    localStorage.removeItem(key);
  }

  removeItem(key: string): void {
    this.clearCookies(key);
    localStorage.removeItem(key);
  }

  private clearCookies(key: string): void {
    const count = Number(this.readCookie(`${key}${COUNT_SUFFIX}`));
    const chunkCount = Number.isInteger(count) && count > 0 ? count : 8;
    for (let index = 0; index < chunkCount; index += 1) {
      this.writeCookie(`${key}${COUNT_SUFFIX}_${index}`, "", 0);
    }
    this.writeCookie(`${key}${COUNT_SUFFIX}`, "", 0);
    this.writeCookie(key, "", 0);
  }

  private readCookie(name: string): string | null {
    const prefix = `${name}=`;
    const match = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix));
    return match ? match.slice(prefix.length) : null;
  }

  private writeCookie(name: string, value: string, maxAge: number): void {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${value}; Path=${this.path}; Max-Age=${maxAge}; SameSite=Lax${secure}`;
  }
}

function safelyDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
