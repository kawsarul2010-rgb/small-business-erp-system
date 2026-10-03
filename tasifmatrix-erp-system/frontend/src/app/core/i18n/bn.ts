import { BN_SERVER } from './bn/server';
import { BN_UI } from './bn/ui';

/** English text -> Bangla. Split by area; an earlier part wins when both have a key. */
export const BN: Readonly<Record<string, string>> = merge(BN_UI, BN_SERVER);

function merge(...parts: Record<string, string>[]): Record<string, string> {
  const all: Record<string, string> = {};
  for (const part of parts) for (const [k, v] of Object.entries(part)) if (!(k in all)) all[k] = v;
  return all;
}
