'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/lib/auth-store';
import type { User } from '@/lib/auth-store';
import {
  adminApi,
  companyApi,
  documentApi,
  evaluationApi,
  normalizeCompanyUsersResponse,
} from '@/lib/api';

const BR = '#4d92c4';

export const ACTIVITY_STATUS_COLORS: Record<string, string> = {
  success: '#118d57',
  warning: '#b76e00',
  info: BR,
  error: '#b71d18',
};

export interface ActivityRow {
  /** Epoch ms for sorting / tooling */
  at: number;
  /** Absolute date & time in local timezone */
  dateTime: string;
  /** What happened (type + subject) */
  event: string;
  /** Display name or email of the account that performed the action */
  byWho: string;
  status: keyof typeof ACTIVITY_STATUS_COLORS;
}

function entityTs(item: unknown): number {
  const o = item as { updatedAt?: string; createdAt?: string };
  return new Date(o.updatedAt || o.createdAt || 0).getTime();
}

function inRange(t: number, start: number, end: number) {
  return t >= start && t <= end;
}

function filterByRange<T>(items: T[], start: number, end: number, getT: (x: T) => number): T[] {
  return items.filter((x) => inRange(getT(x), start, end));
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Stable map key for user/company UUIDs (Postgres may emit mixed case). */
function normActorId(raw: string): string {
  const s = String(raw).trim();
  return UUID_RE.test(s) ? s.toLowerCase() : s;
}

function formatAbsoluteDateTime(ts: number) {
  try {
    return format(new Date(ts), 'MMM d, yyyy HH:mm');
  } catch {
    return '-';
  }
}

function accountLabel(u: Pick<User, 'firstName' | 'lastName' | 'email'>) {
  const n = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  return n || u.email || '-';
}

function teamMemberLabel(u: {
  firstName?: string;
  lastName?: string;
  email?: string;
}) {
  const n = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  return n || u.email || '-';
}

async function buildUserIdToNameMap(authUser: User | null): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (authUser) {
    map.set(normActorId(authUser.id), accountLabel(authUser));
  }
  if (!authUser?.companyId) return map;
  /**
   * Director (company-login) JWT uses `sub` = company id, not a `users` row. Document audit
   * stores that id as uploadedBy / actorUserId: map it so QM and others see a label.
   */
  const companyIdKey = normActorId(authUser.companyId);
  const companyName = (authUser.company?.name ?? '').trim();
  map.set(
    companyIdKey,
    companyName ? `${companyName} (Company admin)` : 'Company admin',
  );
  try {
    const { data } = await companyApi.getUsers();
    const { users: list } = normalizeCompanyUsersResponse(data);
    for (const row of list) {
      const r = row as { id: string; firstName?: string; lastName?: string; email?: string };
      if (r?.id) map.set(normActorId(r.id), teamMemberLabel(r));
    }
  } catch {
    /* non-directors before backend deploy, or network */
  }
  return map;
}

function resolveActor(
  raw: string | undefined | null,
  userMap: Map<string, string>,
  authUser: User | null,
): string {
  if (raw == null || String(raw).trim() === '') {
    return '-';
  }
  const s = String(raw).trim();
  const key = normActorId(s);
  const fromMap = userMap.get(key);
  if (fromMap) return fromMap;
  if (authUser && normActorId(authUser.id) === key) return accountLabel(authUser);
  if (UUID_RE.test(s)) return 'Unknown user';
  return s;
}

type DocumentActivityRow = {
  at: number;
  action: string;
  documentName: string;
};

function formatDocumentActivityEvent(ev: DocumentActivityRow): string {
  const name = ev.documentName;
  switch (ev.action) {
    case 'UPLOAD':
      return `Document · Upload: ${name}`;
    case 'VERSION':
      return `Document · New version uploaded: ${name}`;
    case 'UPDATE':
      return `Document · Details updated: ${name}`;
    case 'ARCHIVE':
      return `Document · Archived: ${name}`;
    case 'RESTORE':
      return `Document · Restored: ${name}`;
    case 'DELETE_HARD':
      return `Document · Permanently deleted: ${name}`;
    case 'EXTRACTION_EDIT':
      return `Document · Extraction edited: ${name}`;
    case 'MANUAL_TEXT':
      return `Document · Manual text updated: ${name}`;
    case 'SHARE_COMPANY':
      return `Document · Shared with company: ${name}`;
    case 'ACL_CHANGE':
      return `Document · Access rules updated: ${name}`;
    case 'OWNER_CHANGE':
      return `Document · Owner changed: ${name}`;
    case 'APPROVAL':
      return `Document · Approval updated: ${name}`;
    case 'SUBMIT_REVIEW':
      return `Document · Submitted for review: ${name}`;
    case 'STANDARD_ACTIVATED':
      return `Standard · Activated: ${name}`;
    case 'PROCESSING_COMPLETE':
      return `Document · Processing complete: ${name}`;
    default:
      return `Document · ${ev.action}: ${name}`;
  }
}

function documentActivityStatus(action: string): keyof typeof ACTIVITY_STATUS_COLORS {
  switch (action) {
    case 'UPLOAD':
    case 'VERSION':
    case 'RESTORE':
    case 'STANDARD_ACTIVATED':
    case 'PROCESSING_COMPLETE':
      return 'success';
    case 'ARCHIVE':
    case 'APPROVAL':
    case 'SUBMIT_REVIEW':
      return 'warning';
    case 'DELETE_HARD':
      return 'error';
    default:
      return 'info';
  }
}

function apiMessage(err: unknown): string {
  const m = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(m) ? m.join(' ') : (m || 'Could not load data');
}

export function useActivityLog(start: number, end: number) {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<ActivityRow[]>([]);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      if (user.role === 'SUPER_ADMIN') {
        const { data: companies } = await adminApi.getCompanies();
        const listRaw = Array.isArray(companies) ? companies : [];
        const list = filterByRange(listRaw, start, end, (c) =>
          new Date((c as { createdAt?: string }).createdAt || 0).getTime()
        );

        const acts: {
          at: number;
          event: string;
          byWho: string;
          status: keyof typeof ACTIVITY_STATUS_COLORS;
        }[] = [];
        for (const c of list) {
          const row = c as { name: string; status: string; email: string; createdAt?: string };
          const at = new Date(row.createdAt || Date.now()).getTime();
          acts.push({
            at,
            event: `Organization · ${row.status}: ${row.name}`,
            byWho: row.email,
            status: row.status === 'ACTIVE' ? 'success' : 'warning',
          });
        }
        acts.sort((a, b) => b.at - a.at);
        setActivities(
          acts.slice(0, 50).map((a) => ({
            at: a.at,
            dateTime: formatAbsoluteDateTime(a.at),
            event: a.event,
            byWho: a.byWho,
            status: a.status,
          }))
        );
        return;
      }

      const userMap = await buildUserIdToNameMap(user);

      const [docActR, tenantFeedR] = await Promise.allSettled([
        documentApi.listActivity({ from: start, to: end }),
        evaluationApi.listActivity({ from: start, to: end }),
      ]);

      const docActsRaw =
        docActR.status === 'fulfilled' && Array.isArray(docActR.value.data) ? docActR.value.data : [];
      const feedRaw =
        tenantFeedR.status === 'fulfilled' && Array.isArray(tenantFeedR.value.data) ? tenantFeedR.value.data : [];

      const actSrc: {
        at: number;
        event: string;
        byWho: string;
        status: keyof typeof ACTIVITY_STATUS_COLORS;
      }[] = [];
      for (const row of docActsRaw) {
        const r = row as DocumentActivityRow & { actorUserId?: string };
        const at = r.at;
        if (!inRange(at, start, end)) continue;
        actSrc.push({
          at,
          event: formatDocumentActivityEvent(r),
          byWho: resolveActor(r.actorUserId, userMap, user),
          status: documentActivityStatus(r.action),
        });
      }
      for (const row of feedRaw) {
        const r = row as { at: number; actorUserId?: string | null; event: string; status?: string };
        if (!inRange(r.at, start, end)) continue;
        const st = r.status;
        const statusKey: keyof typeof ACTIVITY_STATUS_COLORS =
          st === 'success' || st === 'warning' || st === 'error' || st === 'info' ? st : 'info';
        actSrc.push({
          at: r.at,
          event: r.event,
          byWho: resolveActor(r.actorUserId, userMap, user),
          status: statusKey,
        });
      }
      actSrc.sort((x, y) => y.at - x.at);
      setActivities(
        actSrc.slice(0, 200).map((a) => ({
          at: a.at,
          dateTime: formatAbsoluteDateTime(a.at),
          event: a.event,
          byWho: a.byWho,
          status: a.status,
        }))
      );

      const failed = [docActR, tenantFeedR].filter((r) => r.status === 'rejected');
      const hardFailed = failed.filter((r) => {
        const status = (r as PromiseRejectedResult).reason?.response?.status;
        return status !== 503 && status !== undefined;
      });
      if (hardFailed.length > 0) {
        toast.error(apiMessage((hardFailed[0] as PromiseRejectedResult).reason));
      }
    } catch (err: unknown) {
      toast.error(apiMessage(err));
    } finally {
      setLoading(false);
    }
  }, [user, start, end]);

  useEffect(() => {
    load();
  }, [load]);

  return { activities, loading, reload: load };
}
