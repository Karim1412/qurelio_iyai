import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { InternalTokenGuard } from '../common/internal-token.guard';
import { WorkspaceChatContextService } from './workspace-chat-context.service';

/** Service-to-service routes (RAG chat workspace context). Not exposed to browser clients. */
@Controller('internal')
export class InternalController {
  constructor(private readonly workspace: WorkspaceChatContextService) {}

  @Get('workspace-chat-context/:companyId')
  @UseGuards(InternalTokenGuard)
  workspaceChatContext(@Param('companyId') companyId: string) {
    return this.workspace.buildForCompany(companyId);
  }
}
