export type IsoDomain = 'A.5' | 'A.6' | 'A.7' | 'A.8';

export const ISO_DOMAINS: Array<{ code: IsoDomain; title: string }> = [
  { code: 'A.5', title: 'Organizational Controls' },
  { code: 'A.6', title: 'People Controls' },
  { code: 'A.7', title: 'Physical Controls' },
  { code: 'A.8', title: 'Technological Controls' },
];

/**
 * Extracts the ISO 27001 Annex A domain from a control code.
 * For example, "A.5.1" returns "A.5", "A.8.12" returns "A.8".
 * Returns null if the control code does not match a known domain.
 */
export function getIsoDomain(controlCode: string): IsoDomain | null {
  const match = controlCode.match(/^(A\.\d+)/);
  if (!match) {
    return null;
  }

  const domain = match[1] as IsoDomain;
  const validDomains: IsoDomain[] = ['A.5', 'A.6', 'A.7', 'A.8'];

  if (validDomains.includes(domain)) {
    return domain;
  }

  return null;
}
