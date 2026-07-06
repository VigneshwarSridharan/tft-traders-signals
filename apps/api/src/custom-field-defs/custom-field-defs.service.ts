import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CustomFieldDefSummary } from '@tft/shared';
import { CustomFieldDefsRepository } from '../database/custom-field-defs.repository';
import { toCustomFieldDefSummary } from './custom-field-defs.mapper';
import type {
  CreateCustomFieldDefDto,
  UpdateCustomFieldDefDto,
} from './dto/custom-field-defs.schemas';

@Injectable()
export class CustomFieldDefsService {
  constructor(
    private readonly customFieldDefsRepository: CustomFieldDefsRepository,
  ) {}

  async list(): Promise<CustomFieldDefSummary[]> {
    const rows = await this.customFieldDefsRepository.list();
    return rows.map(toCustomFieldDefSummary);
  }

  async create(input: CreateCustomFieldDefDto): Promise<CustomFieldDefSummary> {
    const existing = await this.customFieldDefsRepository.findByKey(input.key);
    if (existing) {
      throw new ConflictException(
        'A custom field with this key already exists',
      );
    }
    const row = await this.customFieldDefsRepository.create(input);
    return toCustomFieldDefSummary(row);
  }

  async update(
    id: string,
    patch: UpdateCustomFieldDefDto,
  ): Promise<CustomFieldDefSummary> {
    const existing = await this.customFieldDefsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Custom field not found');
    }
    const updated = await this.customFieldDefsRepository.update(id, patch);
    if (!updated) {
      throw new NotFoundException('Custom field not found');
    }
    return toCustomFieldDefSummary(updated);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.customFieldDefsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Custom field not found');
    }
    await this.customFieldDefsRepository.delete(id);
  }
}
