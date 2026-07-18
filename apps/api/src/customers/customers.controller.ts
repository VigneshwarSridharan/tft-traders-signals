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
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type {
  CsvImportResult,
  CustomerErasureResult,
  CustomerGdprExport,
  CustomerListResponse,
  CustomerSummary,
  CustomerTimelineResponse,
} from '@tft/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CustomersService } from './customers.service';
import {
  assignTagSchema,
  createCustomerSchema,
  customerListQuerySchema,
  importCustomersSchema,
  updateCustomerSchema,
  type AssignTagDto,
  type CreateCustomerDto,
  type CustomerListQueryDto,
  type ImportCustomersDto,
  type UpdateCustomerDto,
} from './dto/customers.schemas';

@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(customerListQuerySchema))
    query: CustomerListQueryDto,
  ): Promise<CustomerListResponse> {
    return this.customersService.list(query);
  }

  @Get('export')
  @Roles('admin', 'manager')
  async export(
    @Res() res: Response,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    const csv = await this.customersService.exportCsv(user.sub);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="customers.csv"',
    );
    res.send(csv);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerSummary> {
    return this.customersService.get(id);
  }

  @Get(':id/gdpr-export')
  @Roles('admin')
  gdprExport(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<CustomerGdprExport> {
    return this.customersService.exportGdprData(id, user.sub);
  }

  @Post(':id/erase')
  @Roles('admin')
  erase(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<CustomerErasureResult> {
    return this.customersService.erase(id, user.sub);
  }

  @Get(':id/timeline')
  getTimeline(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerTimelineResponse> {
    return this.customersService.getTimeline(id);
  }

  @Post()
  @Roles('admin', 'manager')
  create(
    @Body(new ZodValidationPipe(createCustomerSchema))
    body: CreateCustomerDto,
  ): Promise<CustomerSummary> {
    return this.customersService.create(body);
  }

  @Post('import')
  @Roles('admin', 'manager')
  importCsv(
    @Body(new ZodValidationPipe(importCustomersSchema))
    body: ImportCustomersDto,
  ): Promise<CsvImportResult> {
    return this.customersService.importCsv(body.csv);
  }

  @Patch(':id')
  @Roles('admin', 'manager')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema))
    body: UpdateCustomerDto,
  ): Promise<CustomerSummary> {
    return this.customersService.update(id, body);
  }

  @Delete(':id')
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.customersService.delete(id);
  }

  @Post(':id/tags')
  @Roles('admin', 'manager')
  addTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignTagSchema)) body: AssignTagDto,
  ): Promise<CustomerSummary> {
    return this.customersService.addTag(id, body.tagId);
  }

  @Delete(':id/tags/:tagId')
  @Roles('admin', 'manager')
  removeTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
  ): Promise<CustomerSummary> {
    return this.customersService.removeTag(id, tagId);
  }
}
