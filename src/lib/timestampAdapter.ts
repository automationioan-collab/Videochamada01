export interface FirestoreLikeTimestamp {
  toMillis: () => number;
  toDate: () => Date;
}

export function toTimestampLike(value: unknown): FirestoreLikeTimestamp {
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function' &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    return value as FirestoreLikeTimestamp;
  }

  let ms = 0;
  if (typeof value === 'number' && Number.isFinite(value)) {
    ms = value;
  } else if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    ms = Number.isFinite(parsed) ? parsed : 0;
  } else if (
    value &&
    typeof value === 'object' &&
    typeof (value as { seconds?: unknown }).seconds === 'number'
  ) {
    ms = ((value as { seconds: number }).seconds || 0) * 1000;
  }

  return {
    toMillis: () => ms,
    toDate: () => new Date(ms),
  };
}

export function hydrateTimestampFields<T extends Record<string, unknown>>(
  record: T,
  fields: ReadonlyArray<string> = [
    'createdAt',
    'updatedAt',
    'endedAt',
    'ratedAt',
  ]
): T {
  const copy: Record<string, unknown> = { ...record };
  for (const field of fields) {
    if (copy[field] !== undefined && copy[field] !== null) {
      copy[field] = toTimestampLike(copy[field]);
    }
  }
  return copy as T;
}
