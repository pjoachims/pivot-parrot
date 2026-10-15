/**
 * JSON replacer that converts BigInt to number (safe) or a tagged string (large values).
 * The tag lets bigIntReviver restore precision-losing values back to BigInt on read.
 */
export function bigIntReplacer(_key: string, value: any): any {
  if (typeof value === 'bigint') {
    if (value <= Number.MAX_SAFE_INTEGER && value >= Number.MIN_SAFE_INTEGER) {
      return Number(value);
    }
    return { __bigint: value.toString() };
  }
  return value;
}

/**
 * JSON reviver that restores values tagged by bigIntReplacer back to BigInt.
 */
export function bigIntReviver(_key: string, value: any): any {
  if (value && typeof value === 'object' && typeof value.__bigint === 'string') {
    return BigInt(value.__bigint);
  }
  return value;
}

/** A deep copy a host can JSON.stringify: int64 filter values arrive as BigInt. */
export function toPlainJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, bigIntReplacer));
}

/** Undoes toPlainJSON's BigInt tagging on a value read back from a host. */
export function fromPlainJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), bigIntReviver);
}
