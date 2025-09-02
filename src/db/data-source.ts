import * as dotenv from 'dotenv';
import { ConfigService } from '@nestjs/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { SeederOptions } from 'typeorm-extension';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

const envFile = `.env.${process.env.NODE_ENV || 'development'}`;
dotenv.config({ path: envFile });

export const createStandaloneDataSource = (): DataSourceOptions & SeederOptions => ({
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: +process.env.DATABASE_PORT!,
  username: process.env.DATABASE_USER,
  // 비밀번호를 반드시 문자열로 강제 변환
  password: String(process.env.DATABASE_PASSWORD),
  database: process.env.DATABASE_DBNAME,
  synchronize: process.env.DATABASE_SYNCHRONIZE === 'true',
  dropSchema: process.env.DATABASE_DROP_SCHEMA === 'true',
  logging: process.env.DATABASE_LOGGING === 'true',
  migrationsRun: false,
  migrationsTableName: 'migration_history',
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/db/migrations/*.js'],
  seeds: ['dist/db/seeds/**/*.seed.js'],
  factories: ['dist/db/factories/**/*.factory.js'],
  namingStrategy: new SnakeNamingStrategy(),
});

export const createNestJSDatasource = (
  configService: ConfigService,
): DataSourceOptions & SeederOptions => ({
  type: 'postgres',
  host: configService.get<string>('DATABASE_HOST'),
  port: configService.get<number>('DATABASE_PORT'),
  username: configService.get<string>('DATABASE_USER'),
  // 비밀번호를 반드시 문자열로 강제 변환
  password: String(configService.get<string>('DATABASE_PASSWORD')),
  database: configService.get<string>('DATABASE_DBNAME'),
  synchronize: configService.get<boolean>('DATABASE_SYNCHRONIZE'),
  dropSchema: configService.get<boolean>('DATABASE_DROP_SCHEMA'),
  logging: configService.get<boolean>('DATABASE_LOGGING'),
  migrationsRun: false,
  migrationsTableName: 'migration_history',
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/db/migrations/*.js'],
  seeds: ['dist/db/seeds/**/*.seed.js'],
  factories: ['dist/db/factories/**/*.factory.js'],
  namingStrategy: new SnakeNamingStrategy(),
});

export default new DataSource({
  ...createStandaloneDataSource(),
});