import {
  Controller, Get, Param, Headers, UnauthorizedException, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/index';
import { CompanyService } from '../company/company.service';

/** Service-to-service: company display name for exports (same secret as document internal API). */
@Controller('internal')
export class InternalController {
  constructor(
    private readonly cfg: ConfigService,
    private readonly company: CompanyService,
  ) {}

  @Public()
  @Get('companies/:companyId/display-name')
  async companyDisplayName(
    @Param('companyId') companyId: string,
    @Headers('x-internal-token') xInternalToken: string | string[] | undefined,
  ): Promise<{ name: string }> {
    const expected = (this.cfg.get<string>('DOCUMENT_INTERNAL_TOKEN') || '').trim();
    const got = String(Array.isArray(xInternalToken) ? xInternalToken[0] : xInternalToken ?? '').trim();
    if (!expected || got !== expected) {
      throw new UnauthorizedException('Invalid internal token');
    }
    const name = await this.company.getCompanyDisplayName(companyId.trim());
    if (!name) throw new NotFoundException('Company not found');
    return { name };
  }
}
