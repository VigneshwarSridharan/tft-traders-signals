import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { EnvConfig } from '../config/env.validation';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { ScopesGuard } from './guards/scopes.guard';

const jwtModule = JwtModule.registerAsync({
  inject: [ConfigService],
  useFactory: (configService: ConfigService<EnvConfig, true>) => ({
    secret: configService.get('JWT_ACCESS_SECRET', { infer: true }),
    signOptions: {
      expiresIn: configService.get('JWT_ACCESS_TTL', { infer: true }),
    },
  }),
});

@Module({
  imports: [jwtModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    ApiKeyAuthGuard,
    ScopesGuard,
  ],
  exports: [jwtModule, JwtAuthGuard, RolesGuard, ApiKeyAuthGuard, ScopesGuard],
})
export class AuthModule {}
