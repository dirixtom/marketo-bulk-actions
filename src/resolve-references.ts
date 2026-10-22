export type Resolution = { reference: string; id: number } | { reference: string; error: string };

/** Turns campaign references into smart campaign IDs. Only numeric IDs are supported so far. */
export function resolveReferences(references: string[]): Resolution[] {
  return references.map((reference) =>
    /^\d+$/.test(reference)
      ? { reference, id: Number(reference) }
      : { reference, error: "campaign names are not yet supported, use the numeric ID" },
  );
}
