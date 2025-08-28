import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { LoginUserDto } from './dto/login-user.dto';
import { UserRole } from '../users/entities/user-role.enum';
import { LoginResponseDto } from './dto/login-response.dto';

describe('AuthController', () => {
  let authController: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    validateUser: jest.fn(),
    login: jest.fn(),
    refreshToken: jest.fn(),
    validateAccessToken: jest.fn(),
    logout: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    authController = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(authController).toBeDefined();
  });

  describe('login', () => {
    const loginDto: LoginUserDto = {
      email: 'test@example.com',
      password: 'password123',
    };

    it('should return DTO with tokens and user info', async () => {
      const mockUser = {
        id: 1,
        email: loginDto.email,
        role: UserRole.USER,
      };
      const mockResult: LoginResponseDto = {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        user: {
          name: 'John Doe',
          nickname: 'johndoe',
          email: loginDto.email,
          role: UserRole.USER,
        },
      };

      mockAuthService.validateUser.mockResolvedValue(mockUser);
      mockAuthService.login.mockResolvedValue(mockResult);

      const result = await authController.login(loginDto);

      expect(authService.validateUser).toHaveBeenCalledWith(
        loginDto.email,
        loginDto.password,
      );
      expect(authService.login).toHaveBeenCalledWith(mockUser);
      expect(result).toEqual(mockResult);
    });
  });

  describe('refreshToken', () => {
    it('should return new token pair', async () => {
      const mockToken = 'valid-refresh-token';
      const mockResult = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      };

      mockAuthService.refreshToken.mockResolvedValue(mockResult);

      const result = await authController.refreshToken(mockToken);

      expect(authService.refreshToken).toHaveBeenCalledWith(mockToken);
      expect(result).toEqual(mockResult);
    });

    it('should throw UnauthorizedException for missing token', async () => {
      await expect(authController.refreshToken('')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('validateToken', () => {
    it('should return validation result', async () => {
      const mockToken = 'Bearer valid-token';
      mockAuthService.validateAccessToken.mockResolvedValue(true);

      const result = await authController.validateToken(mockToken);

      expect(authService.validateAccessToken).toHaveBeenCalledWith(
        mockToken.split(' ')[1],
      );
      expect(result).toEqual({ valid: true });
    });
  });

  describe('logout', () => {
    it('should call authService.logout with refresh token', async () => {
      const mockToken = 'valid-refresh-token';
      mockAuthService.logout.mockResolvedValue(undefined);

      await authController.logout(mockToken);

      expect(authService.logout).toHaveBeenCalledWith(mockToken);
    });

    it('should throw UnauthorizedException for missing refresh token', async () => {
      jest
        .spyOn(mockAuthService, 'logout')
        .mockRejectedValue(new UnauthorizedException('Invalid refresh token.'));
      await expect(authController.logout('')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(authService.logout).not.toHaveBeenCalled();
    });

    it('should propagate InternalServerErrorException from authService', async () => {
      jest
        .spyOn(mockAuthService, 'logout')
        .mockRejectedValue(new InternalServerErrorException('Logout failed.'));

      await expect(authController.logout('valid-token')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});