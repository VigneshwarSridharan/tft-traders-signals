import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  SenderAccountSummary,
  VerifySenderAccountResponse,
} from '@tft/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  createSenderAccountSchema,
  updateSenderAccountSchema,
  type CreateSenderAccountDto,
  type UpdateSenderAccountDto,
} from './dto/sender-accounts.schemas';
import { SenderAccountsService } from './sender-accounts.service';

@Controller('sender-accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class SenderAccountsController {
  constructor(private readonly senderAccountsService: SenderAccountsService) {}

  @Get()
  list(): Promise<SenderAccountSummary[]> {
    return this.senderAccountsService.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SenderAccountSummary> {
    return this.senderAccountsService.get(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createSenderAccountSchema))
    body: CreateSenderAccountDto,
  ): Promise<SenderAccountSummary> {
    return this.senderAccountsService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSenderAccountSchema))
    body: UpdateSenderAccountDto,
  ): Promise<SenderAccountSummary> {
    return this.senderAccountsService.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.senderAccountsService.delete(id);
  }

  @Post(':id/verify')
  verify(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VerifySenderAccountResponse> {
    return this.senderAccountsService.verify(id);
  }
}
