import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TemplateCategorySummary } from '@tft/shared';
import { TemplateCategoriesRepository } from '../database/template-categories.repository';
import { TemplatesRepository } from '../database/templates.repository';
import { toTemplateCategorySummary } from './template-categories.mapper';
import type {
  CreateTemplateCategoryDto,
  UpdateTemplateCategoryDto,
} from './dto/template-categories.schemas';

@Injectable()
export class TemplateCategoriesService {
  constructor(
    private readonly templateCategoriesRepository: TemplateCategoriesRepository,
    private readonly templatesRepository: TemplatesRepository,
  ) {}

  async list(): Promise<TemplateCategorySummary[]> {
    const rows = await this.templateCategoriesRepository.list();
    return rows.map(toTemplateCategorySummary);
  }

  async create(
    input: CreateTemplateCategoryDto,
  ): Promise<TemplateCategorySummary> {
    const existing = await this.templateCategoriesRepository.findByName(
      input.name,
    );
    if (existing) {
      throw new ConflictException('A category with this name already exists');
    }
    const row = await this.templateCategoriesRepository.create(input.name);
    return toTemplateCategorySummary(row);
  }

  async update(
    id: string,
    patch: UpdateTemplateCategoryDto,
  ): Promise<TemplateCategorySummary> {
    const existing = await this.templateCategoriesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    if (patch.defaultTemplateId) {
      const template = await this.templatesRepository.findById(
        patch.defaultTemplateId,
      );
      if (!template || template.category_id !== id) {
        throw new BadRequestException(
          'Default template must belong to this category',
        );
      }
    }

    const updated = await this.templateCategoriesRepository.update(id, patch);
    if (!updated) {
      throw new NotFoundException('Category not found');
    }
    return toTemplateCategorySummary(updated);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.templateCategoriesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Category not found');
    }
    const templates = await this.templatesRepository.list({ categoryId: id });
    if (templates.length > 0) {
      throw new ConflictException(
        'Cannot delete a category that still has templates',
      );
    }
    await this.templateCategoriesRepository.delete(id);
  }
}
