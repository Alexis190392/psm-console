import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../../backend/app.module';

export async function createNestContext(): Promise<INestApplicationContext> {
  return NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log']
  });
}
