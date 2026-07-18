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
  Query,
  UseGuards,
} from '@nestjs/common';
import type { CustomerListResponse, CustomerSummary } from '@tft/shared';
import { RequireScopes } from '../auth/decorators/scopes.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiKeyAuthGuard } from '../auth/guards/api-key-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ScopesGuard } from '../auth/guards/scopes.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  createCustomerSchema,
  customerListQuerySchema,
  updateCustomerSchema,
  type CreateCustomerDto,
  type CustomerListQueryDto,
  type UpdateCustomerDto,
} from '../customers/dto/customers.schemas';
import { CustomersService } from '../customers/customers.service';
import { ApiKeyRateLimitGuard } from './api-key-rate-limit.guard';

/**
 * Reuses CustomersService/its zod schemas exactly as CustomersController
 * does. Only the CRUD subset (list/get/create/update/delete) is exposed
 * here — import/export, tagging, timeline, and GDPR endpoints stay
 * dashboard-only for now.
 */
@Controller('v1/customers')
@UseGuards(ApiKeyAuthGuard, RolesGuard, ScopesGuard, ApiKeyRateLimitGuard)
export class PublicApiCustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequireScopes('read:customers')
  list(
    @Query(new ZodValidationPipe(customerListQuerySchema))
    query: CustomerListQueryDto,
  ): Promise<CustomerListResponse> {
    return this.customersService.list(query);
  }

  @Get(':id')
  @RequireScopes('read:customers')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerSummary> {
    return this.customersService.get(id);
  }

  @Post()
  @Roles('admin', 'manager')
  @RequireScopes('write:customers')
  create(
    @Body(new ZodValidationPipe(createCustomerSchema)) body: CreateCustomerDto,
  ): Promise<CustomerSummary> {
    return this.customersService.create(body);
  }

  @Patch(':id')
  @Roles('admin', 'manager')
  @RequireScopes('write:customers')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomerDto,
  ): Promise<CustomerSummary> {
    return this.customersService.update(id, body);
  }

  @Delete(':id')
  @Roles('admin', 'manager')
  @RequireScopes('write:customers')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.customersService.delete(id);
  }
}
