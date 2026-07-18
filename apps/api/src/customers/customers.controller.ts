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
  CustomerListResponse,
  CustomerSummary,
  CustomerTimelineResponse,
} from '@tft/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
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
  async export(@Res() res: Response): Promise<void> {
    const csv = await this.customersService.exportCsv();
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

  @Get(':id/timeline')
  getTimeline(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerTimelineResponse> {
    return this.customersService.getTimeline(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createCustomerSchema))
    body: CreateCustomerDto,
  ): Promise<CustomerSummary> {
    return this.customersService.create(body);
  }

  @Post('import')
  importCsv(
    @Body(new ZodValidationPipe(importCustomersSchema))
    body: ImportCustomersDto,
  ): Promise<CsvImportResult> {
    return this.customersService.importCsv(body.csv);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema))
    body: UpdateCustomerDto,
  ): Promise<CustomerSummary> {
    return this.customersService.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.customersService.delete(id);
  }

  @Post(':id/tags')
  addTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignTagSchema)) body: AssignTagDto,
  ): Promise<CustomerSummary> {
    return this.customersService.addTag(id, body.tagId);
  }

  @Delete(':id/tags/:tagId')
  removeTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
  ): Promise<CustomerSummary> {
    return this.customersService.removeTag(id, tagId);
  }
}
