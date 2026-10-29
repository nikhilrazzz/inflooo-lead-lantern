export const ALLOWED_DOMAINS = ["inflooo.com", "makeitviral.ai"];

export function isAllowedEmail(email: string | null | undefined) {
  const domain = (email ?? "").toLowerCase().split("@")[1] ?? "";
  return ALLOWED_DOMAINS.includes(domain);
}
