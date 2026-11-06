export const TENANT_ROLES = [
  'DIRECTOR',
  'QUALITY_MANAGER',
  'AUDITOR',
  'OPERATOR',
] as const;

export const PUBLIC_ROUTES: ReadonlyArray<{ method: string; path: string }> = [
  { method: 'POST', path: '/auth/register/company' },
  { method: 'POST', path: '/auth/register/user' },
  { method: 'POST', path: '/auth/verify/user' },
  { method: 'POST', path: '/auth/verify/company' },
  { method: 'POST', path: '/auth/otp/resend' },
  { method: 'POST', path: '/auth/login' },
  { method: 'POST', path: '/auth/refresh' },
  { method: 'POST', path: '/auth/forgot-password' },
  { method: 'POST', path: '/auth/reset-password' },
  { method: 'POST', path: '/auth/setup-account' },
  { method: 'POST', path: '/auth/contact' },
  /** Public "Book a demo" page: browse open slots and submit a request. */
  { method: 'GET', path: '/demo/slots' },
  { method: 'POST', path: '/demo/bookings' },
];

export function isPublicInternalPath(method: string, path: string): boolean {
  return method === 'POST' && path.startsWith('/notifications/internal');
}

export function isInternalTokenPath(path: string): boolean {
  return path.startsWith('/documents/internal/');
}

export function isRagInternalOnlyPath(method: string, path: string): boolean {
  if (method !== 'POST') return false;
  return path === '/ingest' || path === '/evaluate';
}

/** Super admin may only call `/admin` and `/auth` (and logout); block tenant quality APIs. */
export const SUPER_ADMIN_TENANT_BLOCK_PREFIXES = [
  '/documents',
  '/evaluations',
  '/nc',
  '/audits',
  '/reports',
  '/notifications',
  '/chat',
  '/company',
] as const;

export function isSuperAdminBlockedFromTenantApi(path: string): boolean {
  return SUPER_ADMIN_TENANT_BLOCK_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export interface CustomRule {
  test: (method: string, path: string) => boolean;
  roles: string[];
}

export const CUSTOM_RULES: CustomRule[] = [
  {
    test: (m, p) => m === 'PATCH' && /^\/documents\/[^/]+\/(extraction|manual-text)$/.test(p),
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR'],
  },
  {
    test: (m, p) =>
      m === 'DELETE' &&
      /^\/documents\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p),
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR'],
  },
  {
    test: (m, p) => m === 'GET' && p === '/evaluations/activity',
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR'],
  },
  {
    test: (m, p) => m === 'GET' && /^\/evaluations\/[^/]+\/export$/.test(p),
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR'],
  },
  {
    test: (m, p) => m === 'GET' && /^\/audits\/[^/]+\/export$/.test(p),
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR'],
  },
  {
    test: (m, p) => m === 'PATCH' && /^\/evaluations\/[^/]+\/clauses\/.+$/.test(p),
    roles: ['QUALITY_MANAGER', 'AUDITOR'],
  },
  {
    test: (m, p) => m === 'POST' && /^\/evaluations\/[^/]+\/confirm-nc-drafts$/.test(p),
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR'],
  },
  {
    test: (m, p) => m === 'POST' && /^\/evaluations\/[^/]+\/retry$/.test(p),
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR'],
  },
  {
    test: (m, p) => m === 'POST' && p === '/evaluations/retry',
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR'],
  },
  {
    test: (m, p) =>
      m === 'DELETE' &&
      /^\/evaluations\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p),
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR'],
  },
  /** NC reads (list, KPIs, single NC, why-analysis), explicit so tenant roles always match before any future PREFIX tightening. */
  {
    test: (m, p) => m === 'GET' && (p === '/nc' || p.startsWith('/nc/')),
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR'],
  },
  {
    test: (m, p) => m === 'POST' && p === '/nc',
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR'],
  },
  {
    test: (m, p) => m === 'POST' && p.startsWith('/nc/'),
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR'],
  },
  /** Keep tenant NC PATCH routes (incl. RCA save) reachable for operators; PREFIX_RULES alone can omit OPERATOR on some paths. */
  {
    test: (m, p) => m === 'PATCH' && p.startsWith('/nc/'),
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR'],
  },
  {
    test: (m, p) => m === 'GET' && (p === '/reports' || p.startsWith('/reports/')),
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR'],
  },
  {
    test: (m, p) => m === 'POST' && (p === '/reports' || p.startsWith('/reports/')),
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR'],
  },
  {
    test: (m, p) =>
      (m === 'PUT' || m === 'PATCH' || m === 'DELETE') && p.startsWith('/reports/'),
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR'],
  },
];

export interface PrefixRule {
  prefix: string;
  methods: string[] | '*';
  roles: string[];
}

export const PREFIX_RULES: PrefixRule[] = [
  { prefix: '/admin', methods: '*', roles: ['SUPER_ADMIN'] },

  { prefix: '/company/pending-summary', methods: ['GET'], roles: ['DIRECTOR'] },
  {
    prefix: '/company/users',
    methods: ['GET'],
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR'],
  },
  {
    prefix: '/company/users',
    methods: ['POST', 'PATCH', 'DELETE'],
    roles: ['DIRECTOR'],
  },
  // Company profile (onboarding): read for all tenant roles, write for director only
  {
    prefix: '/company/profile',
    methods: ['GET'],
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR'],
  },
  {
    prefix: '/company/profile',
    methods: ['PUT', 'POST', 'DELETE'],
    roles: ['DIRECTOR'],
  },

  {
    prefix: '/documents/upload',
    methods: ['POST'],
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR'],
  },
  {
    prefix: '/documents/products',
    methods: ['POST', 'DELETE'],
    roles: ['DIRECTOR', 'QUALITY_MANAGER'],
  },
  {
    prefix: '/documents/',
    methods: ['PATCH', 'DELETE'],
    roles: ['DIRECTOR', 'QUALITY_MANAGER'],
  },
  {
    prefix: '/documents/',
    methods: ['POST'],
    roles: ['DIRECTOR', 'QUALITY_MANAGER'],
  },

  {
    prefix: '/evaluations',
    methods: ['POST'],
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR'],
  },

  {
    prefix: '/nc/capa',
    methods: ['PATCH'],
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR'],
  },
  {
    prefix: '/nc/',
    methods: ['PATCH'],
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR'],
  },
  {
    prefix: '/nc/',
    methods: ['POST'],
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR'],
  },

  {
    prefix: '/audits',
    methods: ['POST', 'PATCH'],
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR'],
  },
  {
    prefix: '/audits/',
    methods: ['POST', 'PATCH', 'PUT', 'DELETE'],
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR'],
  },

  {
    prefix: '/reports/templates',
    methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
    roles: ['DIRECTOR', 'QUALITY_MANAGER'],
  },
  {
    prefix: '/reports/',
    methods: ['DELETE'],
    roles: ['DIRECTOR', 'QUALITY_MANAGER'],
  },

  {
    prefix: '/chat',
    methods: ['POST'],
    roles: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR'],
  },
];
