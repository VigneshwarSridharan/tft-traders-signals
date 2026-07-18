import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { renderApiDocsPage } from './docs-page.util';
import { OPENAPI_SPEC } from './openapi-spec';

/** Public, unauthenticated by design — this is documentation, not data. */
@Controller('v1')
export class PublicApiDocsController {
  @Get('openapi.json')
  openapiJson(): typeof OPENAPI_SPEC {
    return OPENAPI_SPEC;
  }

  @Get('docs')
  docs(@Res() res: Response): void {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(renderApiDocsPage());
  }
}
