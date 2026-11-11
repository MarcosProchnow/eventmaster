/** O Drizzle embrulha o erro do driver em `cause`; o código SQLSTATE fica lá. */
function pgErrorCode(error: unknown): string | undefined {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  for (const c of candidates) {
    const code = (c as { code?: unknown } | null)?.code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

export const isUniqueViolation = (error: unknown) => pgErrorCode(error) === "23505";
