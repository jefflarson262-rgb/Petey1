// Compares the access code a visitor sent with the one set on the server, in a way that does not leak how many characters matched.
import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (v) => createHash('sha256').update(String(v)).digest();
export const codeMatches = (given, expected) => Boolean(given) && Boolean(expected) && timingSafeEqual(digest(given), digest(expected));
