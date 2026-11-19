/** Staff can use their configured email or employee code, but device imports have no portal credential. */
export function hasStaffPortalLogin({ email, password }: { email: string | null; password: string | null }) {
  return Boolean(email && password && !email.toLowerCase().endsWith("@device.local"));
}
