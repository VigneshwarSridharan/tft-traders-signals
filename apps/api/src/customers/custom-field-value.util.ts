import { BadRequestException } from '@nestjs/common';
import type { CustomFieldType } from '@tft/shared';

export function validateCustomFieldValue(
  fieldType: CustomFieldType,
  key: string,
  value: string,
): void {
  switch (fieldType) {
    case 'number':
      if (Number.isNaN(Number(value))) {
        throw new BadRequestException(
          `Value for custom field "${key}" must be a number`,
        );
      }
      break;
    case 'date':
      if (Number.isNaN(Date.parse(value))) {
        throw new BadRequestException(
          `Value for custom field "${key}" must be a valid date`,
        );
      }
      break;
    case 'url':
      try {
        new URL(value);
      } catch {
        throw new BadRequestException(
          `Value for custom field "${key}" must be a valid URL`,
        );
      }
      break;
    case 'text':
      break;
  }
}
