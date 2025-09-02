import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import {
  initializeTransactionalContext,
  StorageDriver,
  addTransactionalDataSource,
} from 'typeorm-transactional';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  // 1. 트랜잭션 컨텍스트 초기화 (가장 먼저 실행)
  initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });
  
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // 2. ✅ 데이터 소스 인스턴스 가져오기 및 트랜잭션 등록
  const dataSource = app.get(DataSource);
  addTransactionalDataSource(dataSource);

  // 3. 마이그레이션 실행 (필요 시)
  if (configService.get<boolean>('DATABASE_MIGRATIONS_RUN')) {
    await dataSource.runMigrations({ transaction: 'all' });
  }

  // 4. 포트 설정
  const port = configService.get<number>('PORT', 3000);
  
  // 5. CORS 설정 (개발용)
  const frontEndOrigin = '*';
  app.enableCors({
    origin: frontEndOrigin,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Set-Cookie'],
    exposedHeaders: ['Set-Cookie'],
  });

  // 6. 글로벌 검증 파이프
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // 7. Swagger 설정 (수정됨 - 핵심 변경사항)
  const config = new DocumentBuilder()
    .setTitle('TRPG + Chat API')
    .setDescription('통합 API 문서')
    .setVersion('1.0')
    // JWT 인증 세부 설정 추가 (기존 .addBearerAuth()보다 정확한 설정)
    .addBearerAuth(
      { 
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'access-token', // 인증 이름 (미들웨어와 일치해야 함)
    )
    .addTag('Auth', '인증 관련 API')
    .addTag('Users', '사용자 관리 API')
    .addTag('Chat', '실시간 채팅 API')
    .addTag('TRPG', 'TRPG 게임 API')
    .build();

  // Swagger UI 설정 개선 (기존 코드보다 상세한 설정)
  SwaggerModule.setup('api', app, SwaggerModule.createDocument(app, config), {
    customSiteTitle: 'TRPG Chat API 문서', // 브라우저 탭 제목
    customCssUrl: 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css',
    swaggerOptions: {
      persistAuthorization: true, // 페이지 이동 시 토큰 유지
      displayRequestDuration: true, // 요청 소요 시간 표시
      filter: true, // API 필터링 기능 활성화
      tagsSorter: 'alpha', // 태그 알파벳 정렬
      operationsSorter: 'alpha', // 연산 알파벳 정렬
      docExpansion: 'list', // 기본으로 모든 API 펼쳐서 표시
    },
  });

  // 8. WebSocket adapter
  app.useWebSocketAdapter(new IoAdapter(app));

  // 9. 서버 시작
  await app.listen(port);
  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 API 문서 확인: http://localhost:${port}/api`);
}
bootstrap();