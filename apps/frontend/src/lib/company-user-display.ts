/** Display names for company users (audits, assignments, etc.). */

export type CompanyUserRow = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

export type CompanyMemberOption = {
  id: string;
  name: string;
  email?: string;
};

export function companyUserDisplayName(u: CompanyUserRow): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return name || u.email?.trim() || u.id;
}

export function mapCompanyMemberOptions(users: CompanyUserRow[]): CompanyMemberOption[] {
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: companyUserDisplayName(u),
  }));
}

/** "asma salah (email@…)" → "asma salah" */
export function stripLeadAuditorEmailSuffix(value: string): string {
  const s = value.trim();
  const m = s.match(/^(.+?)\s*\([^)]*@[^)]+\)\s*$/);
  if (m) return m[1].trim();
  return s;
}

/** Normalize stored lead auditor (email or legacy label) to display name only. */
export function resolveLeadAuditorName(
  stored: string,
  members?: CompanyMemberOption[],
): string {
  const raw = stripLeadAuditorEmailSuffix(stored);
  if (!raw || !members?.length) return raw;
  const lower = raw.toLowerCase();
  const byEmail = members.find((m) => m.email && m.email.toLowerCase() === lower);
  if (byEmail) return byEmail.name;
  const byName = members.find((m) => m.name.toLowerCase() === lower);
  if (byName) return byName.name;
  return raw;
}

export function currentUserLeadAuditorName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
} | null | undefined): string {
  if (!user) return '';
  return companyUserDisplayName({
    id: '',
    firstName: user.firstName ?? undefined,
    lastName: user.lastName ?? undefined,
    email: user.email ?? undefined,
  });
}
