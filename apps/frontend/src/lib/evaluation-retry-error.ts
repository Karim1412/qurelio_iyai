/** Maps axios/network errors from evaluation retry into short, actionable copy. */
export function formatEvaluationRetryError(err: unknown): string {
  const ax = err as {
    response?: { status?: number; data?: { message?: string } | string };
    message?: string;
  };
  const status = ax.response?.status;
  const raw =
    (typeof ax.response?.data === 'object' &&
      ax.response?.data &&
      'message' in ax.response.data &&
      (ax.response.data as { message?: string }).message) ||
    (typeof ax.response?.data === 'string' ? ax.response.data : '') ||
    ax.message ||
    '';

  const s = String(raw).toLowerCase();

  if (status === 403) {
    return 'You don’t have permission to retry evaluations. Ask a Director or Quality Manager.';
  }
  if (status === 401) {
    return 'Your session expired. Sign in again, then retry.';
  }
  if (status === 404 || s.includes('cannot post') || s.includes('not found')) {
    return 'The evaluation service could not run this action. If the problem continues, contact support.';
  }
  if (s.includes('missing stored request') || s.includes('payload')) {
    return 'This run can’t be retried automatically. Create a new evaluation with the same standard and product.';
  }
  if (s.includes('network') || s.includes('timeout') || ax.message === 'Network Error') {
    return 'Network error. Check your connection and try again.';
  }

  if (typeof raw === 'string' && raw.length > 0 && raw.length < 220) {
    return raw;
  }
  return 'Retry failed. Please try again in a moment.';
}
