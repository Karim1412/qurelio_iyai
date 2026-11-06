import axios, { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from './auth-store';

type RetryRequestConfig = InternalAxiosRequestConfig & { _retryAfterRefresh?: boolean };

let refreshPromise: Promise<string | null> | null = null;

function apiBaseURL(): string {
  if (typeof window !== 'undefined') {
    return '';
  }
  return (
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://127.0.0.1:3000'
  );
}

/**
 * Base URL for multipart uploads.
 *
 * Uploads may bypass the Next.js rewrite proxy, which caps the body at 10 MB.
 * Set NEXT_PUBLIC_GATEWAY_URL (build-time) to a gateway URL the BROWSER can
 * reach and large files go straight there.
 *
 * Without it we fall back to the same origin, i.e. the ordinary /api/* rewrite
 * every other call already uses. The previous fallback guessed `<host>:3100`,
 * which silently broke every upload on any deployment whose gateway is not
 * published on 3100: the request never reached a listener at all.
 */
function gatewayUploadURL(): string {
  if (typeof window !== 'undefined') {
    const configured = (process.env.NEXT_PUBLIC_GATEWAY_URL || '').trim();
    // Same-origin '' keeps the request on the Next proxy, which always works.
    if (!configured) return '';
    try {
      const target = new URL(configured, window.location.href);
      /**
       * A gateway on a different host than the page is the wrong gateway: the
       * browser blocks the cross-origin POST (surfacing as a bare "Network
       * Error"), and even if CORS allowed it the request would land on another
       * deployment, which does not accept this session's JWT. This happens
       * whenever a build carries production values but is served from
       * localhost. Fall back to the rewrite, which always reaches the gateway
       * this frontend is actually paired with.
       */
      if (target.hostname !== window.location.hostname) return '';
      return configured.replace(/\/$/, '');
    } catch {
      return '';
    }
  }
  // SSR fallback
  return process.env.INTERNAL_API_URL || 'http://127.0.0.1:3000';
}

const api = axios.create({
  baseURL: apiBaseURL(),
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        if (typeof window === 'undefined') return null;
        const rt = useAuthStore.getState().refreshToken;
        if (!rt) return null;
        const base = apiBaseURL();
        const res = await axios.post<{ accessToken: string; refreshToken?: string }>(
          `${base}/api/auth/refresh`,
          { refreshToken: rt },
          { headers: { 'Content-Type': 'application/json' }, timeout: 25_000 },
        );
        const accessToken = res.data.accessToken;
        const newRt = res.data.refreshToken ?? rt;
        if (!accessToken) return null;
        useAuthStore.getState().setTokens(accessToken, newRt);
        return accessToken;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

function clearSessionAndRedirectToLogin() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('qurelio-auth');
  } catch {
    /* ignore */
  }
  try {
    useAuthStore.getState().logout();
  } catch {
    /* ignore */
  }
  window.location.href = '/auth/login';
}

// ─── Request: attach JWT (prefer zustand so post-refresh retries see the new token immediately) ─
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    try {
      let token: string | null | undefined = useAuthStore.getState().token;
      if (!token) {
        const raw = localStorage.getItem('qurelio-auth');
        token = raw ? JSON.parse(raw)?.state?.token : null;
      }
      if (token) config.headers.Authorization = `Bearer ${token}`;
    } catch {
      /* ignore */
    }
  }
  return config;
});

// ─── Response: refresh on 401, then retry once (no redirect if refresh succeeds) ─
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status = err.response?.status;
    const originalRequest = err.config as RetryRequestConfig | undefined;
    if (status !== 401 || !originalRequest || typeof window === 'undefined') {
      return Promise.reject(err);
    }

    const url = originalRequest.url ?? '';
    const isLoginLike =
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/contact');
    const isRefreshCall = url.includes('/auth/refresh');

    if (isLoginLike) return Promise.reject(err);

    if (isRefreshCall || originalRequest._retryAfterRefresh) {
      clearSessionAndRedirectToLogin();
      return Promise.reject(err);
    }

    const newAccess = await refreshAccessToken();
    if (!newAccess) {
      clearSessionAndRedirectToLogin();
      return Promise.reject(err);
    }

    originalRequest._retryAfterRefresh = true;
    if (!originalRequest.headers) originalRequest.headers = {} as RetryRequestConfig['headers'];
    originalRequest.headers.Authorization = `Bearer ${newAccess}`;
    return api.request(originalRequest);
  },
);

// ─── Auth ───────────────────────────────────────────────────────────────────
export const authApi = {
  loginUser:        (data: any) => api.post('/api/auth/login', data),
  registerUser:     (data: any) => api.post('/api/auth/register/user', data),
  registerCompany:  (data: any) => api.post('/api/auth/register/company', data),
  verifyUserOtp:    (data: any) => api.post('/api/auth/verify/user', data),
  verifyCompanyOtp: (data: any) => api.post('/api/auth/verify/company', data),
  resendOtp:        (email: string) => api.post('/api/auth/otp/resend', { email }),
  forgotPassword:   (email: string) => api.post('/api/auth/forgot-password', { email }),
  resetPassword:    (data: any) => api.post('/api/auth/reset-password', data),
  setupAccount:     (data: any) => api.post('/api/auth/setup-account', data),
  me:               () => api.get('/api/auth/me'),
  updateProfile:    (data: any) => api.patch('/api/auth/profile', data),
  uploadProfileAvatar: (formData: FormData) =>
    api.post('/api/auth/profile/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60_000,
    }),
  removeProfileAvatar: () => api.delete('/api/auth/profile/avatar'),
  changePassword:   (data: any) => api.patch('/api/auth/password', data),
  logout:           () => api.post('/api/auth/logout'),
};

// ─── Admin ──────────────────────────────────────────────────────────────────
export const adminApi = {
  getPendingSummary: ()         => api.get('/api/admin/pending-summary'),
  getCompanies:    ()           => api.get('/api/admin/companies'),
  getCompany:      (id: string) => api.get(`/api/admin/companies/${id}`),
  createCompany:   (data: any)  => api.post('/api/admin/companies', data),
  activateCompany: (id: string) => api.patch(`/api/admin/companies/${id}/activate`),
  suspendCompany:  (id: string) => api.patch(`/api/admin/companies/${id}/suspend`),
  deleteCompany:   (id: string) => api.delete(`/api/admin/companies/${id}`),
};

// ─── Company / Director ──────────────────────────────────────────────────────
export const companyApi = {
  getPendingSummary: ()         => api.get('/api/company/pending-summary'),
  getUsers:       ()              => api.get('/api/company/users'),
  addUser:        (data: any)     => api.post('/api/company/users', data),
  toggleUser:     (userId: string) => api.patch(`/api/company/users/${userId}/toggle`),
  updateUserRole: (userId: string, data: { role: string }) =>
    api.patch(`/api/company/users/${userId}/role`, data),
  removeUser:     (userId: string) => api.delete(`/api/company/users/${userId}`),
};

// ─── Company Profile (Onboarding) ────────────────────────────────────────
export const companyProfileApi = {
  getProfile:    ()                         => api.get('/api/company/profile'),
  saveProfile:   (data: any)                => api.put('/api/company/profile', data),
  updateIdentity:(data: any)                => api.put('/api/company/profile/identity', data),
  updateActivity:(data: any)                => api.put('/api/company/profile/activity', data),
  updateMarkets: (data: any)                => api.put('/api/company/profile/markets', data),
  updateQuality: (data: any)                => api.put('/api/company/profile/quality', data),
  complete:      ()                         => api.post('/api/company/profile/complete'),
  deleteProfile: ()                         => api.delete('/api/company/profile'),
};

export type CompanySeatInfo = { used: number; max: number | null; unlimited: boolean };

/** GET /company/users returns `{ users, seats }` or (older clients) a bare array. */
export function normalizeCompanyUsersResponse(data: unknown): {
  users: unknown[];
  seats: CompanySeatInfo | null;
} {
  if (Array.isArray(data)) return { users: data, seats: null };
  const d = data as { users?: unknown[]; seats?: CompanySeatInfo };
  const seats =
    d?.seats && typeof d.seats.used === 'number'
      ? {
          used: d.seats.used,
          max: d.seats.max ?? null,
          unlimited: Boolean(d.seats.unlimited),
        }
      : null;
  return { users: Array.isArray(d?.users) ? d.users : [], seats };
}

// ─── Documents ───────────────────────────────────────────────────────────────

function resolveAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    let token: string | null | undefined = useAuthStore.getState().token;
    if (!token) {
      const raw = localStorage.getItem('qurelio-auth');
      token = raw ? JSON.parse(raw)?.state?.token : null;
    }
    return token ?? null;
  } catch {
    return null;
  }
}

export const documentApi = {
  list:        (params?: any) => api.get('/api/documents', { params }),
  /** Soft-deleted ("trashed") documents for the company, restorable. */
  listTrash:   ()             => api.get('/api/documents/trash'),
  /** Company document audit events for activity log */
  listActivity: (params: { from: number; to: number }) =>
    api.get('/api/documents/activity', { params }),
  getIsoNorms: ()             => api.get('/api/documents/iso-norms'),
  get:         (id: string)   => api.get(`/api/documents/${id}`, { timeout: 120_000 }),
  /** Binary stream (JWT via gateway); do not use response as JSON */
  getDownload: (id: string) =>
    api.get(`/api/documents/${id}/download`, { responseType: 'blob' }),
  upload: (formData: FormData) => {
    const token = resolveAuthToken();
    return axios.post('/api/documents/upload', formData, {
      baseURL: gatewayUploadURL(),
      headers: {
        'Content-Type': 'multipart/form-data',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      // Safety margin for the raw transfer of a large file (up to 50 MB) over a
      // slow connection. document-service now responds as soon as the file is
      // received — storage write + extraction enqueue happen after the
      // response — so this is not a wait for backend/extraction processing.
      timeout: 900_000,
    });
  },
  uploadVersion: (id: string, formData: FormData) => {
    const token = resolveAuthToken();
    return axios.post(`/api/documents/${id}/version`, formData, {
      baseURL: gatewayUploadURL(),
      headers: {
        'Content-Type': 'multipart/form-data',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      timeout: 900_000,
    });
  },
  update:      (id: string, data: any) => api.patch(`/api/documents/${id}`, data),
  /** Soft-delete (archive) */
  delete:      (id: string)            => api.delete(`/api/documents/${id}`),
  purge:       (id: string)            => api.delete(`/api/documents/${id}/purge`),
  archive:     (id: string)            => api.patch(`/api/documents/${id}/archive`),
  /** Clear per-document ACL so all tenant users can read the file */
  shareWithCompany: (id: string)      => api.patch(`/api/documents/${id}/share`),
  /** STD-004/006: QM activates standard after review; indexes clauses for evaluation */
  activateStandard: (id: string)      => api.patch(`/api/documents/${id}/activate`),
  restore:     (id: string)            => api.patch(`/api/documents/${id}/restore`),
  setOwner:    (id: string, userId: string) => api.patch(`/api/documents/${id}/owner`, { userId }),
  setApproval: (id: string, status: string) => api.patch(`/api/documents/${id}/approval`, { status }),
  submitReview:(id: string)            => api.post(`/api/documents/${id}/submit-review`),
  patchExtraction: (id: string, extractedStructured: Record<string, unknown>) =>
    api.patch(`/api/documents/${id}/extraction`, { extractedStructured }),
  retryExtraction: (id: string) => api.post(`/api/documents/${id}/retry-extraction`),
  manualText:  (id: string, text: string) => api.patch(`/api/documents/${id}/manual-text`, { text }),
  accessRules: (id: string, rules: any[]) => api.put(`/api/documents/${id}/access-rules`, { rules }),
  audit:       (id: string)            => api.get(`/api/documents/${id}/audit`),
  /** File Manager: move/assign a document into a folder (or detach with null). */
  moveToFolder: (id: string, folderId: string | null) =>
    api.patch(`/api/documents/${id}/folder`, { folderId }),
};

// ─── Book a demo ─────────────────────────────────────────────────────────────
export interface DemoSlotPublic {
  id: string;
  startsAt: string;
  durationMinutes: number;
}

export interface DemoSlotAdmin extends DemoSlotPublic {
  status: 'OPEN' | 'BOOKED' | 'BLOCKED';
  booking: { id: string; companyName: string; email: string; status: string } | null;
}

export interface DemoBookingAdmin {
  id: string;
  companyName: string;
  field: string;
  email: string;
  phone: string | null;
  description: string | null;
  companyCapacity: string;
  // Questionnaire answers captured in the booking popup.
  fullName: string | null;
  role: string | null;
  consultingScope: string | null;
  marketsActive: string[];
  marketsTargeting: string[];
  certifications: string[];
  productCount: string | null;
  complianceToday: string | null;
  challenges: string[];
  timeline: string | null;
  decisionRole: string | null;
  pilotInterest: string | null;
  preferredLanguage: string | null;
  consentMarketing: boolean;
  status: 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'CANCELLED';
  adminNote: string | null;
  meetingLink: string | null;
  createdAt: string;
  respondedAt: string | null;
  responseDueAt: string;
  overdue: boolean;
  slot: DemoSlotPublic | null;
}


export const demoApi = {
  /** Public: no auth. Open, future slots only. */
  listSlots: () => api.get<DemoSlotPublic[]>('/api/demo/slots'),
  /** Books the slot and records the questionnaire in one request. */
  book: (data: Record<string, unknown>) => api.post('/api/demo/bookings', data),

  // Admin (SUPER_ADMIN)
  summary: () =>
    api.get<{ pending: number; overdue: number; upcomingSlots: number; responseHours: number }>(
      '/api/admin/demo/summary',
    ),
  listBookings: (status?: string) =>
    api.get<DemoBookingAdmin[]>('/api/admin/demo/bookings', { params: status ? { status } : {} }),
  respond: (id: string, data: { status: string; adminNote?: string; meetingLink?: string }) =>
    api.patch(`/api/admin/demo/bookings/${id}`, data),
  /** Permanent: releases the slot it was holding if that time is still ahead. */
  deleteBooking: (id: string) => api.delete(`/api/admin/demo/bookings/${id}`),

  adminSlots: (from?: string, to?: string) =>
    api.get<DemoSlotAdmin[]>('/api/admin/demo/slots', { params: { from, to } }),
  createSlot: (data: { startsAt: string; durationMinutes?: number }) =>
    api.post('/api/admin/demo/slots', data),
  bulkSlots: (data: { starts: string[]; durationMinutes?: number }) =>
    api.post('/api/admin/demo/slots/bulk', data),
  updateSlot: (id: string, data: { status?: string; startsAt?: string; durationMinutes?: number }) =>
    api.patch(`/api/admin/demo/slots/${id}`, data),
  deleteSlot: (id: string) => api.delete(`/api/admin/demo/slots/${id}`),
};

// ─── File Manager (nestable folder tree) ─────────────────────────────────────
export const folderApi = {
  list:   ()                                            => api.get('/api/documents/folders'),
  create: (data: { name: string; parentId?: string | null }) =>
    api.post('/api/documents/folders', data),
  update: (id: string, data: { name?: string; parentId?: string | null }) =>
    api.patch(`/api/documents/folders/${id}`, data),
  delete: (id: string)                                  => api.delete(`/api/documents/folders/${id}`),
};

// ─── Products (document folders) ─────────────────────────────────────────────
export const productApi = {
  list:   ()                                                   => api.get('/api/documents/products'),
  listArchived: ()                                             => api.get('/api/documents/products?archived=1'),
  get:    (id: string)                                         => api.get(`/api/documents/products/${id}`),
  /** `draft: true` creates a folder that stays hidden until the wizard activates it. */
  create: (data: { name: string; description?: string; sku?: string; draft?: boolean }) =>
    api.post('/api/documents/products', data),
  archive: (id: string)                                       => api.patch(`/api/documents/products/${id}/archive`),
  restore: (id: string)                                       => api.patch(`/api/documents/products/${id}/restore`),
  delete: (id: string)                                         => api.delete(`/api/documents/products/${id}`),
  updateProfile: (id: string, data: any)                       => api.put(`/api/documents/products/${id}/profile`, data),
  completeProduct: (id: string)                                => api.post(`/api/documents/products/${id}/complete`),
  /** User picks which document's value becomes authoritative in mergedProfile. */
  resolveFieldConflict: (id: string, data: { fieldPath: string; documentId: string; value: string }) =>
    api.patch(`/api/documents/products/${id}/resolve-conflict`, data),
  /** Retrieve conservative, explainable regulatory reference candidates; never a legal decision. */
  findApplicabilityCandidates: (id: string) =>
    api.get(`/api/documents/products/${id}/applicability-candidates`),
  /** Read tenant-scoped applicability decisions previously recorded by authorized reviewers. */
  listApplicabilityAssessments: (id: string) =>
    api.get(`/api/documents/products/${id}/applicability-assessments`),
  /** Save a new immutable human-reviewed applicability decision with rationale and evidence references. */
  createApplicabilityAssessment: (id: string, data: {
    regulationId?: string;
    reference: string;
    title?: string;
    decision: 'APPLICABLE' | 'CONDITIONAL' | 'NOT_APPLICABLE' | 'NEEDS_REVIEW';
    rationale: string;
    conditions?: string;
    evidenceReferences: string[];
    sourceUrl?: string;
    sourceVersion?: string;
    monitoredSourceId?: string;
  }) => api.post(`/api/documents/products/${id}/applicability-assessments`, data),
};

// ─── Regulatory monitoring ───────────────────────────────────────────────────
export const regulatoryMonitoringApi = {
  summary: () => api.get('/api/documents/regulatory-monitoring/summary'),
  sources: (params?: { search?: string; jurisdiction?: string; priority?: string; status?: string; limit?: number; offset?: number }) =>
    api.get('/api/documents/regulatory-monitoring/sources', { params }),
  events: (params?: { state?: string; limit?: number; offset?: number }) =>
    api.get('/api/documents/regulatory-monitoring/events', { params }),
  sourceHistory: (sourceId: string, limit = 20) =>
    api.get(`/api/documents/regulatory-monitoring/sources/${encodeURIComponent(sourceId)}/history`, { params: { limit } }),
  queueChecks: (sourceIds?: string[]) =>
    api.post('/api/documents/regulatory-monitoring/check', sourceIds?.length ? { sourceIds } : {}),
  updateSource: (sourceId: string, data: { enabled?: boolean; checkIntervalHours?: number; useRecommendedCadence?: boolean }) =>
    api.patch(`/api/documents/regulatory-monitoring/sources/${encodeURIComponent(sourceId)}`, data),
  reviewEvent: (eventId: string, data: { impactState: 'ACTION_REQUIRED' | 'NO_PRODUCT_IMPACT'; reviewNote: string }) =>
    api.patch(`/api/documents/regulatory-monitoring/events/${encodeURIComponent(eventId)}/review`, data),
};

// ─── Evaluations ─────────────────────────────────────────────────────────────
export const evaluationApi = {
  list:   ()                   => api.get('/api/evaluations'),
  /** Aggregated tenant activity (audits, evaluations, NC/CAPA, explicit events) for the activity log. */
  listActivity: (params: { from: number; to: number }) =>
    api.get('/api/evaluations/activity', { params }),
  get:    (id: string)         => api.get(`/api/evaluations/${id}`),
  create: (data: any)          => api.post('/api/evaluations', data),
  export: (id: string, format: 'xlsx' | 'pdf' | 'csv' = 'xlsx') =>
    api.get(`/api/evaluations/${id}/export`, { params: { format }, responseType: 'blob' }),
  patchClause: (id: string, clauseRef: string, body: { verdict: string; reason: string }) =>
    api.patch(`/api/evaluations/${id}/clauses/${encodeURIComponent(clauseRef)}`, body),
  confirmNcDrafts: (id: string) => api.post(`/api/evaluations/${id}/confirm-nc-drafts`),
  /** Path-style retry matches gateway rules and avoids body routing issues on some setups. */
  retry: (evaluationId: string) =>
    api.post(`/api/evaluations/${encodeURIComponent(evaluationId)}/retry`),
  /** Uses POST …/delete so gateways and Express stacks that mishandle DELETE still work. */
  delete: (id: string) => api.post(`/api/evaluations/${encodeURIComponent(id)}/delete`),
};

// ─── Non-Conformities ────────────────────────────────────────────────────────
export const ncApi = {
  list:           (params?: any)     => api.get('/api/nc', { params, timeout: 60_000 }),
  kpis:           ()                 => api.get('/api/nc/kpis', { timeout: 60_000 }),
  get:            (id: string)       => api.get(`/api/nc/${id}`),
  create:         (data: any)        => api.post('/api/nc', data),
  update:         (id: string, data: any) => api.patch(`/api/nc/${id}`, data),
  whyAnalysis:    (id: string)       => api.get(`/api/nc/${id}/why-analysis`),
  /** CAPA-008: AI probable root causes (RAG + tenant NC history via evaluation-service). */
  aiRootCauses: (id: string) =>
    api.post(`/api/nc/${id}/ai/root-causes`, undefined, { timeout: 100_000 }),
  /** CAPA-009: AI 6M Ishikawa branch text. */
  aiIshikawa: (id: string) =>
    api.post(`/api/nc/${id}/ai/ishikawa`, undefined, { timeout: 100_000 }),
  /** RCA save uses `PATCH /nc/:id?rca=1` so it always hits the existing `@Patch(':id')` route (avoids `/rca` sub-path 404s). */
  saveRca:        (id: string, data: any) => api.patch(`/api/nc/${encodeURIComponent(id)}?rca=1`, data),
  startRca:       (id: string)       => api.post(`/api/nc/${id}/start-rca`),
  startCapa:      (id: string)       => api.post(`/api/nc/${id}/start-capa`),
  rejectNc:       (id: string, data?: { reason?: string }) => api.post(`/api/nc/${id}/reject`, data ?? {}),
  addCapa:        (id: string, data: any) => api.post(`/api/nc/${id}/capa`, data),
  patchCapa:      (capaId: string, data: any) => api.patch(`/api/nc/capa/${capaId}`, data),
  completeCapa:   (capaId: string)   => api.patch(`/api/nc/capa/${capaId}/complete`),
  verify:         (id: string, data: any) => api.post(`/api/nc/${id}/verify`, data),
};

// ─── Audits ──────────────────────────────────────────────────────────────────
export const auditApi = {
  list:            (params?: any)    => api.get('/api/audits', { params }),
  kpis:            ()                => api.get('/api/audits/kpis'),
  get:             (id: string)      => api.get(`/api/audits/${id}`),
  update:          (id: string, data: { title?: string; leadAuditor?: string; scope?: string }) =>
    api.patch(`/api/audits/${id}`, data),
  create:          (data: any)       => api.post('/api/audits', data),
  suggestChecklist: (body: { isoStandard: string; scopeClauseRefs?: string[] }) =>
    api.post('/api/audits/checklist-suggestions', body),
  replaceChecklists: (
    id: string,
    items: { isoClause: string; question: string; hierarchyLevel?: number | null }[],
  ) => api.put(`/api/audits/${id}/checklists`, { items }),
  changeLog:       (id: string)      => api.get(`/api/audits/${id}/change-log`),
  export:          (id: string, format: 'xlsx' | 'pdf' = 'xlsx') =>
    api.get(`/api/audits/${id}/export`, {
      params: { format },
      responseType: 'blob',
      timeout: 120_000,
      validateStatus: () => true,
    }),
  start:           (id: string)      => api.patch(`/api/audits/${id}/start`),
  cancel:          (id: string)      => api.patch(`/api/audits/${id}/cancel`),
  addFinding:      (id: string, data: any) => api.post(`/api/audits/${id}/findings`, data),
  updateChecklist: (
    checklistId: string,
    data: {
      answer?: string;
      score?: number | null;
      notes?: string;
      attachmentDocumentId?: string | null;
      evidenceChecks?: Array<{ id: string; label: string; checked: boolean; source?: 'default' | 'ai' | 'user' }>;
    },
  ) => api.patch(`/api/audits/checklist/${checklistId}`, data),
  suggestChecklistAiScore: (checklistId: string) =>
    api.post<{ score: number; answer?: string; rationale?: string; model?: string }>(
      `/api/audits/checklist/${checklistId}/ai-score`,
      undefined,
      { timeout: 60_000 },
    ),
  generateAiClauseEvidenceItems: (checklistId: string) =>
    api.post<{ items: Array<{ id: string; label: string; checked: boolean; source?: string }>; added: number; message: string }>(
      `/api/audits/checklist/${checklistId}/ai-evidence-items`,
      undefined,
      { timeout: 90_000 },
    ),
  bulkAiFillEmptyCriteria: (auditId: string) =>
    api.post<{ filled: number; capped: boolean; message: string }>(
      `/api/audits/${auditId}/ai-fill-empty-criteria`,
      undefined,
      { timeout: 900_000 },
    ),
  complete:        (id: string, conclusion: string) => api.post(`/api/audits/${id}/complete`, { conclusion }),
  remove:          (id: string) => api.delete(`/api/audits/${id}`),
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationApi = {
  list: (params?: { unread?: boolean; archived?: boolean }) =>
    api.get('/api/notifications', {
      params: {
        ...(params?.unread === true ? { unread: true } : {}),
        ...(params?.archived === true ? { archived: true } : {}),
      },
    }),
  unreadCount: () => api.get<{
    count: number;
    unread?: number;
    activeTotal?: number;
    archived?: number;
  }>('/api/notifications/unread-count'),
  markRead:    (id: string) => api.patch(`/api/notifications/${id}/read`),
  markAllRead: () => api.patch('/api/notifications/read-all'),
  archive:     (id: string) => api.patch(`/api/notifications/${id}/archive`),
  unarchive:   (id: string) => api.patch(`/api/notifications/${id}/unarchive`),
  remove:      (id: string) => api.delete(`/api/notifications/${id}`),
  /** Alias used by Topbar (same endpoint as remove) */
  delete:      (id: string) => api.delete(`/api/notifications/${id}`),
};

// ─── RAG Chat ────────────────────────────────────────────────────────────────
export const ragApi = {
  chat: (data: { question: string; history: any[] }) =>
    api.post('/api/chat', data),
};

// ─── Contact ─────────────────────────────────────────────────────────────────
export const contactApi = {
  send: (data: {
    firstName: string;
    lastName:  string;
    email:     string;
    subject:   string;
    message:   string;
  }) => api.post('/api/auth/contact', data),
};

// ─── Reports ──────────────────────────────────────────────────────────────────
export const reportApi = {
  // Reports
  list: (params?: any) => api.get('/api/reports', { params }),
  get: (id: string) => api.get(`/api/reports/${id}`),
  create: (data: any) => api.post('/api/reports', data),
  update: (id: string, data: any) => api.put(`/api/reports/${id}`, data),
  changeStatus: (id: string, data: { status: string; comment?: string }) =>
    api.patch(`/api/reports/${id}/status`, data),
  getModifications: (id: string) => api.get(`/api/reports/${id}/modifications`),
  getApprovals: (id: string) => api.get(`/api/reports/${id}/approvals`),
  getVersions: (id: string) => api.get(`/api/reports/${id}/versions`),
  delete: (id: string) => api.delete(`/api/reports/${id}`),
  export: (id: string, format: 'pdf' = 'pdf') =>
    api.get(`/api/reports/${id}/export`, {
      params: { format },
      responseType: 'blob',
      timeout: 120_000,
      validateStatus: () => true,
    }),

  // Templates
  listTemplates: (params?: any) => api.get('/api/reports/templates/list', { params }),
  getTemplate: (id: string) => api.get(`/api/reports/templates/${id}`),
  createTemplate: (data: any) => api.post('/api/reports/templates/create', data),
  updateTemplate: (id: string, data: any) => api.put(`/api/reports/templates/${id}`, data),
  archiveTemplate: (id: string) => api.patch(`/api/reports/templates/${id}/archive`),
  activateTemplate: (id: string) => api.patch(`/api/reports/templates/${id}/activate`),
  getTemplateVersions: (id: string) => api.get(`/api/reports/templates/${id}/versions`),
  duplicateTemplate: (id: string, data: { newName: string }) =>
    api.post(`/api/reports/templates/${id}/duplicate`, data),
  deleteTemplate: (id: string) => api.delete(`/api/reports/templates/${id}`),
};

export default api;