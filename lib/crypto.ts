import crypto from "crypto";

const ALGO = "aes-256-gcm";

/** 32-byte key from ENCRYPTION_KEY (raw 64-hex char key, or any string hashed to 32 bytes). */
function key(): Buffer {
  const k = process.env.ENCRYPTION_KEY ?? "";
  if (/^[0-9a-fA-F]{64}$/.test(k)) return Buffer.from(k, "hex");
  return crypto.createHash("sha256").update(k).digest();
}

/** Encrypt a string → "iv:tag:ciphertext" (all base64). */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

/** Decrypt an "iv:tag:ciphertext" payload produced by `encrypt`. */
export function decrypt(payload: string): string {
  const [ivB, tagB, dataB] = payload.split(":");
  const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
}
