import axios from 'axios';
import { ConfigService } from '@nestjs/config';

/** Resolve tenant display name via auth-service internal API. */
export async function fetchCompanyDisplayName(
  cfg: ConfigService,
  companyId: string,
): Promise<string> {
  const base = (cfg.get('AUTH_SERVICE_URL', 'http://auth-service:3002') || '').replace(/\/$/, '');
  const token = (cfg.get<string>('DOCUMENT_INTERNAL_TOKEN') || '').trim();
  if (!base || !token || !companyId?.trim()) return 'Company';
  try {
    const r = await axios.get(
      `${base}/api/internal/companies/${encodeURIComponent(companyId)}/display-name`,
      {
        headers: { 'X-Internal-Token': token },
        timeout: 12000,
        validateStatus: () => true,
      },
    );
    if (r.status !== 200 || typeof r.data?.name !== 'string') return 'Company';
    const n = r.data.name.trim();
    return n || 'Company';
  } catch {
    return 'Company';
  }
}
