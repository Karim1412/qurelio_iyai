import { All, Controller, Logger, Req, Res } from '@nestjs/common';
import { Request, Response }                  from 'express';
import { ProxyService }                       from './proxy.service';
import { RbacService }                        from '../rbac/rbac.service';

@Controller()
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name);

  constructor(
    private proxy: ProxyService,
    private rbac: RbacService,
  ) {}

  // Match all verbs and all paths EXCEPT /api/health (handled elsewhere)
  @All('*')
  async handle(@Req() req: Request,
   @Res() res: Response): Promise<any> {
    try {
      const authPayload = this.rbac.assertRequestAllowed({
        method:  req.method,
        path:    req.path || req.url,
        headers: req.headers as Record<string, string | string[] | undefined>,
      });

      const contentType = (req.headers['content-type'] ?? '').toLowerCase();
      const acceptHeader = (req.headers['accept'] ?? '').toString().toLowerCase();
      let status: number;
      let data: any;

      const rawPath = req.path.replace(/^\/api/, '') || '/';

      const isSseRequest =
        req.method === 'GET' &&
        (acceptHeader.includes('text/event-stream') || /\/stream$/.test(rawPath));

      if (isSseRequest) {
        const upstream = await this.proxy.forwardSse({
          path: rawPath,
          headers: req.headers as Record<string, string | string[] | undefined>,
          query: req.query as Record<string, any>,
        });
        if (upstream.status >= 400) {
          upstream.stream?.destroy?.();
          return res.status(upstream.status).json({ statusCode: upstream.status, message: 'Upstream stream rejected' });
        }
        res.setHeader('Content-Type', upstream.contentType ?? 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('Connection', 'keep-alive');
        (res as any).flushHeaders?.();

        const cleanup = () => { try { upstream.stream.destroy(); } catch { /* ignore */ } };
        req.on('close', cleanup);
        upstream.stream.on('error', () => { try { res.end(); } catch { /* ignore */ } });
        upstream.stream.on('end', () => { try { res.end(); } catch { /* ignore */ } });
        upstream.stream.pipe(res);
        return;
      }

      const isAvatarBinary =
        req.method === 'GET' &&
        (rawPath === '/auth/profile/avatar/image' ||
          rawPath === '/company/avatar/image' ||
          /^\/company\/users\/[^/]+\/avatar\/image$/.test(rawPath) ||
          /^\/admin\/companies\/[^/]+\/avatar\/image$/.test(rawPath));

      // Document file downloads (PDF, image, docx…) and exports (eval/audit/report)
      // must travel as raw bytes; the JSON-buffering forward path corrupts them
      // and the Blob arrives with mime `application/json`, breaking previews.
      const isDocumentDownload =
        req.method === 'GET' && /^\/documents\/[^/]+\/download$/.test(rawPath);
      const isEvaluationExport =
        req.method === 'GET' && /^\/evaluations\/[^/]+\/export$/.test(rawPath);
      const isAuditExport =
        req.method === 'GET' && /^\/audits\/[^/]+\/export$/.test(rawPath);
      const isReportExport =
        req.method === 'GET' && /^\/reports\/[^/]+\/export$/.test(rawPath);

      if (isAvatarBinary || isDocumentDownload || isEvaluationExport || isAuditExport || isReportExport) {
        const bin = await this.proxy.forwardBinary({
          method:  'GET',
          path:    rawPath,
          headers: req.headers as Record<string, string | string[] | undefined>,
          query:   req.query as Record<string, any>,
        });
        if (bin.contentType) res.setHeader('Content-Type', bin.contentType);
        if (bin.contentDisposition) res.setHeader('Content-Disposition', bin.contentDisposition);
        res.setHeader('Cache-Control', 'private, no-store');
        return res.status(bin.status).send(Buffer.from(bin.data));
      }

      if (contentType.includes('multipart/form-data')) {
        // For file uploads the body has NOT been parsed by Express, pipe the raw stream
        ({ status, data } = await this.proxy.forwardStream({
          method:  req.method,
          path:    rawPath,
          stream:  req,
          headers: req.headers as Record<string, string>,
          query:   req.query as Record<string, any>,
        }));
      } else {
        let body = Object.keys(req.body ?? {}).length ? req.body : undefined;
        if (req.method === 'POST' && rawPath === '/chat') {
          const companyId = authPayload?.companyId ?? (authPayload?.role === 'DIRECTOR' ? authPayload.sub : null);
          if (!companyId) {
            return res.status(403).json({ statusCode: 403, message: 'Tenant context missing from token' });
          }
          body = { ...(body ?? {}), company_id: companyId };
        }
        ({ status, data } = await this.proxy.forward({
          method:  req.method,
          path:    rawPath,
          body,
          headers: req.headers as Record<string, string>,
          query:   req.query as Record<string, any>,
        }));
      }

      return res.status(status).json(data);
    } catch (err: any) {
      const status  = err.status ?? err.getStatus?.() ?? 503;
      const message = err.message ?? 'Gateway error';
      this.logger.error(`${req.method} ${req.path} → ${status}: ${message}`);
      return res.status(status).json({ statusCode: status, message });
    }
  }
}
