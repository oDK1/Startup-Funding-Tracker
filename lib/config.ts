/**
 * Centralized configuration for feature flags and app settings.
 * Uses environment variables to enable/disable features at build time.
 */
export const config = {
  /**
   * Whether to show source links (company names link to articles).
   * Set to true for private version, false for public version.
   */
  showSourceLinks: process.env.NEXT_PUBLIC_SHOW_SOURCE_LINKS === "true",
} as const;
