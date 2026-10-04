import { playlistScopedKey } from "./playlist-scoped-key";
export interface PinHash { salt: string; hash: string }
export type ParentalPins = ReadonlyMap<string, PinHash>;
export const parentalPinsKey = (id: string): string => playlistScopedKey("parental-pins", id);
export const isValidPin = (pin: string): boolean => /^\d{4,8}$/.test(pin);

const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const bytes = (value: string): Uint8Array<ArrayBuffer> => Uint8Array.from(value.match(/../g) ?? [], (b) => parseInt(b, 16));

/** Хеш с отдельной солью для каждой группы; исходный PIN не сохраняется. */
async function derive(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const result = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: bytes(salt), iterations: 100_000 }, key, 256);
  return hex(new Uint8Array(result));
}

export async function createPinHash(pin: string): Promise<PinHash> {
  if (!isValidPin(pin)) throw new Error("PIN must contain 4–8 digits");
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await derive(pin, salt) };
}

export async function verifyPin(pin: string, record: PinHash): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  return await derive(pin, record.salt) === record.hash;
}

export function parseParentalPins(raw: string | null): ParentalPins {
  const result = new Map<string, PinHash>();
  try {
    const data: unknown = JSON.parse(raw ?? "null");
    if (!Array.isArray(data)) return result;
    for (const entry of data) {
      if (!entry || typeof entry !== "object" || typeof entry.group !== "string") continue;
      if (typeof entry.salt === "string" && /^[a-f0-9]{32}$/.test(entry.salt) &&
          typeof entry.hash === "string" && /^[a-f0-9]{64}$/.test(entry.hash)) {
        result.set(entry.group, { salt: entry.salt, hash: entry.hash });
      }
    }
  } catch { /* некорректный JSON не содержит пригодных хешей */ }
  return result;
}

export function serializeParentalPins(pins: ParentalPins): string {
  return JSON.stringify([...pins].map(([group, record]) => ({ group, ...record })));
}
