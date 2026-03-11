/**
 * Asserts that an environment variable is set and non-empty.
 * Throws a clear error at startup (or first use) if the variable is absent,
 * preventing silent failures from undefined config.
 *
 * @param name - The environment variable name
 * @returns The non-empty string value
 */
export function assertEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    throw new Error(
      `[floow] Missing required environment variable: ${name}\n` +
        `Make sure it is defined in your .env file (or deployment environment).`
    )
  }
  return value
}
