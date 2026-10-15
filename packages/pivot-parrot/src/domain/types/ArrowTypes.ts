/**
 * Arrow type system
 *
 * Defines standard Arrow types with their behavior and visual representation.
 * Each type is a self-contained object with all necessary metadata and transform functions.
 */

/**
 * Icon keys for visual type representation
 */
export type IconKey = 'integer' | 'float' | 'string' | 'calendar' | 'clock' | 'toggle' | 'struct' | 'array' | 'map';

export interface ArrowTypeDefinition {
  name: string;
  icon: IconKey;  // References TypeIcons registry
  isNumeric: boolean;
  category: 'integer' | 'float' | 'string' | 'temporal' | 'boolean' | 'complex';
  toDisplay: (val: any, params?: string | null) => any;  // params for parameterized types like decimal<35,19>
  toSQL: (val: any, params?: string | null) => string;
}

/**
 * Helper to escape SQL string values
 */
function escapeSQLString(value: any): string {
  return String(value).replace(/'/g, "''");
}

/**
 * Helper to format BigInt decimal with scale
 * Converts scaled BigInt back to decimal string
 * e.g., BigInt 12345600000000000000000n with scale 19 → "1234.56"
 */
function formatBigIntDecimal(val: bigint, scale: number): string {
  const isNegative = val < 0n;
  const absStr = (isNegative ? -val : val).toString();

  if (scale === 0) {
    return isNegative ? `-${absStr}` : absStr;
  }

  // Pad with leading zeros if needed
  const padded = absStr.padStart(scale + 1, '0');
  const intPart = padded.slice(0, -scale) || '0';
  const fracPart = padded.slice(-scale);

  // Trim trailing zeros from fractional part
  const trimmedFrac = fracPart.replace(/0+$/, '');

  const result = trimmedFrac ? `${intPart}.${trimmedFrac}` : intPart;
  return isNegative ? `-${result}` : result;
}

/**
 * Convert Uint32Array to signed BigInt
 * Apache Arrow JS represents Decimal128/256 as Uint32Array in little-endian format
 */
function uint32ArrayToBigInt(arr: Uint32Array): bigint {
  let bigVal = 0n;
  for (let i = 0; i < arr.length; i++) {
    bigVal |= BigInt(arr[i]) << BigInt(i * 32);
  }
  // Handle sign bit (two's complement)
  const bitWidth = BigInt(arr.length * 32);
  const signBit = 1n << (bitWidth - 1n);
  if ((bigVal & signBit) !== 0n) {
    bigVal -= 1n << bitWidth;
  }
  return bigVal;
}

/**
 * Format decimal value (handles Uint32Array, BigInt, or number)
 */
function formatDecimalValue(val: any, params: string | null): any {
  if (val === null || val === undefined) return null;

  // Extract scale from params "precision,scale"
  const scale = params ? parseInt(params.split(',')[1], 10) : NaN;

  // Handle Uint32Array (Apache Arrow JS representation)
  if (val instanceof Uint32Array && !isNaN(scale)) {
    return formatBigIntDecimal(uint32ArrayToBigInt(val), scale);
  }

  // Handle BigInt
  if (typeof val === 'bigint' && !isNaN(scale)) {
    return formatBigIntDecimal(val, scale);
  }

  // Try to convert to number
  try {
    const num = Number(val);
    if (!isNaN(num)) return num;
  } catch {
    return String(val);
  }
  return val;
}

/**
 * Convert Uint32Array (Arrow decimal) to Number for charts
 */
export function uint32ArrayToNumber(arr: Uint32Array, scale: number): number {
  const bigVal = uint32ArrayToBigInt(arr);
  return Number(bigVal) / Math.pow(10, scale);
}

/**
 * Arrow standard types
 * Each type is a shared object that dialects can reference
 */
export const Arrow = {
  // Integer types
  int8: {
    name: 'int8',
    icon: 'integer' as IconKey,
    isNumeric: true,
    category: 'integer' as const,
    toDisplay: (val) => val,
    toSQL: (val) => val === null || val === undefined ? 'NULL' : String(val)
  },
  int16: {
    name: 'int16',
    icon: 'integer' as IconKey,
    isNumeric: true,
    category: 'integer' as const,
    toDisplay: (val) => val,
    toSQL: (val) => val === null || val === undefined ? 'NULL' : String(val)
  },
  int32: {
    name: 'int32',
    icon: 'integer' as IconKey,
    isNumeric: true,
    category: 'integer' as const,
    toDisplay: (val) => val,
    toSQL: (val) => val === null || val === undefined ? 'NULL' : String(val)
  },
  int64: {
    name: 'int64',
    icon: 'integer' as IconKey,
    isNumeric: true,
    category: 'integer' as const,
    toDisplay: (val) => {
      if (val === null || val === undefined) return null;
      if (typeof val === 'bigint') {
        // Check if safe to convert to Number for formatting
        if (val <= Number.MAX_SAFE_INTEGER && val >= Number.MIN_SAFE_INTEGER) {
          return Number(val);
        }
        return String(val);
      }
      return val;
    },
    toSQL: (val) => val === null || val === undefined ? 'NULL' : String(val)
  },

  // Unsigned integers
  uint8: {
    name: 'uint8',
    icon: 'integer' as IconKey,
    isNumeric: true,
    category: 'integer' as const,
    toDisplay: (val: any) => val,
    toSQL: (val: any) => val === null || val === undefined ? 'NULL' : String(val)
  },
  uint16: {
    name: 'uint16',
    icon: 'integer' as IconKey,
    isNumeric: true,
    category: 'integer' as const,
    toDisplay: (val: any) => val,
    toSQL: (val: any) => val === null || val === undefined ? 'NULL' : String(val)
  },
  uint32: {
    name: 'uint32',
    icon: 'integer' as IconKey,
    isNumeric: true,
    category: 'integer' as const,
    toDisplay: (val: any) => val,
    toSQL: (val: any) => val === null || val === undefined ? 'NULL' : String(val)
  },
  uint64: {
    name: 'uint64',
    icon: 'integer' as IconKey,
    isNumeric: true,
    category: 'integer' as const,
    toDisplay: (val: any) => val,
    toSQL: (val: any) => val === null || val === undefined ? 'NULL' : String(val)
  },

  // Floating point
  float16: {
    name: 'float16',
    icon: 'float' as IconKey,
    isNumeric: true,
    category: 'float' as const,
    toDisplay: (val: any) => val,
    toSQL: (val: any) => val === null || val === undefined ? 'NULL' : String(val)
  },
  float32: {
    name: 'float32',
    icon: 'float' as IconKey,
    isNumeric: true,
    category: 'float' as const,
    toDisplay: (val: any) => val,
    toSQL: (val: any) => val === null || val === undefined ? 'NULL' : String(val)
  },
  float64: {
    name: 'float64',
    icon: 'float' as IconKey,
    isNumeric: true,
    category: 'float' as const,
    toDisplay: (val: any) => val,
    toSQL: (val: any) => val === null || val === undefined ? 'NULL' : String(val)
  },
  double: {
    name: 'double',
    icon: 'float' as IconKey,
    isNumeric: true,
    category: 'float' as const,
    toDisplay: (val: any) => val,
    toSQL: (val: any) => val === null || val === undefined ? 'NULL' : String(val)
  },

  // Decimal
  // params format: "precision,scale" e.g., "35,19"
  decimal: {
    name: 'decimal',
    icon: 'float' as IconKey,
    isNumeric: true,
    category: 'float' as const,
    toDisplay: (val: any, params?: string | null) => formatDecimalValue(val, params),
    toSQL: (val: any, params?: string | null) => val === null || val === undefined ? 'NULL' : String(formatDecimalValue(val, params))
  },
  decimal128: {
    name: 'decimal128',
    icon: 'float' as IconKey,
    isNumeric: true,
    category: 'float' as const,
    toDisplay: (val: any, params?: string | null) => formatDecimalValue(val, params),
    toSQL: (val: any, params?: string | null) => val === null || val === undefined ? 'NULL' : String(formatDecimalValue(val, params))
  },
  decimal256: {
    name: 'decimal256',
    icon: 'float' as IconKey,
    isNumeric: true,
    category: 'float' as const,
    toDisplay: (val: any, params?: string | null) => formatDecimalValue(val, params),
    toSQL: (val: any, params?: string | null) => val === null || val === undefined ? 'NULL' : String(formatDecimalValue(val, params))
  },

  // String types
  utf8: {
    name: 'utf8',
    icon: 'string' as IconKey,
    isNumeric: false,
    category: 'string' as const,
    toDisplay: (val: any) => val,
    toSQL: (val: any) => val === null || val === undefined ? 'NULL' : `'${escapeSQLString(val)}'`
  },
  string: {
    name: 'string',
    icon: 'string' as IconKey,
    isNumeric: false,
    category: 'string' as const,
    toDisplay: (val: any) => val,
    toSQL: (val: any) => val === null || val === undefined ? 'NULL' : `'${escapeSQLString(val)}'`
  },
  large_utf8: {
    name: 'large_utf8',
    icon: 'string' as IconKey,
    isNumeric: false,
    category: 'string' as const,
    toDisplay: (val: any) => val,
    toSQL: (val: any) => val === null || val === undefined ? 'NULL' : `'${escapeSQLString(val)}'`
  },

  // Temporal types
  date32: {
    name: 'date32',
    icon: 'calendar' as IconKey,
    isNumeric: false,
    category: 'temporal' as const,
    toDisplay: (val: any) => {
      if (val === null || val === undefined) return null;
      if (typeof val === 'number') {
        return new Date(val).toISOString().slice(0, 10);
      }
      return val;
    },
    toSQL: (val: any) => {
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'number') {
        return `DATE '${new Date(val).toISOString().slice(0, 10)}'`;
      }
      return `DATE '${val}'`;
    }
  },
  date64: {
    name: 'date64',
    icon: 'calendar' as IconKey,
    isNumeric: false,
    category: 'temporal' as const,
    toDisplay: (val: any) => {
      if (val === null || val === undefined) return null;
      if (typeof val === 'number') {
        return new Date(val).toISOString().slice(0, 10);
      }
      return val;
    },
    toSQL: (val: any) => {
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'number') {
        return `DATE '${new Date(val).toISOString().slice(0, 10)}'`;
      }
      return `DATE '${val}'`;
    }
  },
  timestamp: {
    name: 'timestamp',
    icon: 'clock' as IconKey,
    isNumeric: false,
    category: 'temporal' as const,
    toDisplay: (val: any) => {
      if (val === null || val === undefined) return null;
      if (typeof val === 'number') {
        return new Date(val).toISOString().replace('T', ' ').slice(0, 19);
      }
      return val;
    },
    toSQL: (val: any) => {
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'number') {
        return `TIMESTAMP '${new Date(val).toISOString()}'`;
      }
      return `TIMESTAMP '${val}'`;
    }
  },
  time32: {
    name: 'time32',
    icon: 'clock' as IconKey,
    isNumeric: false,
    category: 'temporal' as const,
    toDisplay: (val: any) => val,
    toSQL: (val: any) => val === null || val === undefined ? 'NULL' : `TIME '${val}'`
  },
  time64: {
    name: 'time64',
    icon: 'clock' as IconKey,
    isNumeric: false,
    category: 'temporal' as const,
    toDisplay: (val: any) => val,
    toSQL: (val: any) => val === null || val === undefined ? 'NULL' : `TIME '${val}'`
  },

  // Boolean
  bool: {
    name: 'bool',
    icon: 'toggle' as IconKey,
    isNumeric: false,
    category: 'boolean' as const,
    toDisplay: (val: any) => val,
    toSQL: (val: any) => val === null || val === undefined ? 'NULL' : (val ? 'TRUE' : 'FALSE')
  },

  // Complex types
  struct: {
    name: 'struct',
    icon: 'struct' as IconKey,
    isNumeric: false,
    category: 'complex' as const,
    toDisplay: (val: any) => val,
    toSQL: (val: any) => val === null || val === undefined ? 'NULL' : String(val)
  },
  list: {
    name: 'list',
    icon: 'array' as IconKey,
    isNumeric: false,
    category: 'complex' as const,
    toDisplay: (val: any) => val,
    toSQL: (val: any) => val === null || val === undefined ? 'NULL' : String(val)
  },
  large_list: {
    name: 'large_list',
    icon: 'array' as IconKey,
    isNumeric: false,
    category: 'complex' as const,
    toDisplay: (val: any) => val,
    toSQL: (val: any) => val === null || val === undefined ? 'NULL' : String(val)
  },
  map: {
    name: 'map',
    icon: 'map' as IconKey,
    isNumeric: false,
    category: 'complex' as const,
    toDisplay: (val: any) => val,
    toSQL: (val: any) => val === null || val === undefined ? 'NULL' : String(val)
  },

  // Binary
  binary: {
    name: 'binary',
    icon: 'string' as IconKey,
    isNumeric: false,
    category: 'string' as const,
    toDisplay: (val: any) => val,
    toSQL: (val: any) => val === null || val === undefined ? 'NULL' : String(val)
  },
  large_binary: {
    name: 'large_binary',
    icon: 'string' as IconKey,
    isNumeric: false,
    category: 'string' as const,
    toDisplay: (val: any) => val,
    toSQL: (val: any) => val === null || val === undefined ? 'NULL' : String(val)
  }
} as const;

export type ArrowType = typeof Arrow[keyof typeof Arrow];

/**
 * Lookup Arrow type by name
 * Handles parameterized types like "decimal<35,19>" by extracting base type
 */
export function getArrowType(name: string): ArrowType | null {
  // For parameterized types like "decimal<35,19>", extract base type
  const baseName = name.includes('<') ? name.slice(0, name.indexOf('<')) : name;
  return (Arrow as any)[baseName] || null;
}
