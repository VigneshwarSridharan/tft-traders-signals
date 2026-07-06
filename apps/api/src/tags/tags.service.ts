import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TagSummary } from '@tft/shared';
import { TagsRepository } from '../database/tags.repository';
import { toTagSummary } from './tags.mapper';
import type { CreateTagDto, UpdateTagDto } from './dto/tags.schemas';

@Injectable()
export class TagsService {
  constructor(private readonly tagsRepository: TagsRepository) {}

  async list(): Promise<TagSummary[]> {
    const rows = await this.tagsRepository.list();
    return rows.map(toTagSummary);
  }

  async create(input: CreateTagDto): Promise<TagSummary> {
    const existing = await this.tagsRepository.findByName(input.name);
    if (existing) {
      throw new ConflictException('A tag with this name already exists');
    }
    const row = await this.tagsRepository.create({
      name: input.name,
      color: input.color ?? null,
    });
    return toTagSummary(row);
  }

  async update(id: string, patch: UpdateTagDto): Promise<TagSummary> {
    const existing = await this.tagsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Tag not found');
    }
    const updated = await this.tagsRepository.update(id, patch);
    if (!updated) {
      throw new NotFoundException('Tag not found');
    }
    return toTagSummary(updated);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.tagsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Tag not found');
    }
    await this.tagsRepository.delete(id);
  }
}
