import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption utilities class
 */
export class EncryptionUtils {
  static createKeyHash(key: string): Buffer {
    return createHash("sha256").update(key).digest();
  }

  static encrypt(data: Buffer, key: string): Buffer {
    const keyHash = this.createKeyHash(key);
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-cbc", keyHash, iv);

    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    return Buffer.concat([iv, encrypted]);
  }

  static decrypt(encryptedData: Buffer, key: string): Buffer {
    const keyHash = this.createKeyHash(key);
    const iv = encryptedData.subarray(0, 16);
    const encrypted = encryptedData.subarray(16);

    const decipher = createDecipheriv("aes-256-cbc", keyHash, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }
}