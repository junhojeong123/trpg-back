import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: {
            getHealthStatus: jest.fn().mockReturnValue({
              status: 'ok',
              timestamp: new Date().toISOString()
            }),
          },
        },
      ],
    }).compile();

    appController = module.get<AppController>(AppController);
    appService = module.get<AppService>(AppService);
  });

  describe('health check', () => {
    it('should return health status', () => {
      const result = appController.health();
      expect(result).toEqual({
        status: 'ok',
        timestamp: expect.any(String)
      });
    });
  });
});