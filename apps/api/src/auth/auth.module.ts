import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { EnvConfig } from '../config/env.validation';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

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
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  exports: [jwtModule, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
