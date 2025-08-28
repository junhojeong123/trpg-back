import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createUserEntity } from '../users/factory/user.factory';
import {
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RefreshTokenRepository } from './refresh-token.repository';
import { createMock } from '@golevelup/ts-jest';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/entities/user-role.enum';
import * as crypto from 'crypto';

jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => ({}),
}));

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;
  let refreshTokenRepo: RefreshTokenRepository;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: createMock<UsersService>() },
        { provide: JwtService, useValue: createMock<JwtService>() },
        {
          provide: RefreshTokenRepository,
          useValue: createMock<RefreshTokenRepository>(),
        },
        { provide: ConfigService, useValue: createMock<ConfigService>() },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
    refreshTokenRepo = module.get<RefreshTokenRepository>(
      RefreshTokenRepository,
    );
    configService = module.get(ConfigService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => { });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(authService).toBeDefined();
  });

  describe('validateUser', () => {
    it('should return user if credentials are valid', async () => {
      const mockUser = createUserEntity();
      const password = 'password123';
      mockUser.passwordHash = await bcrypt.hash(password, 10);

      jest.spyOn(usersService, 'getUserByEmail').mockResolvedValue(mockUser);

      const result = await authService.validateUser(
        mockUser.email,
        'password123',
      );

      expect(usersService.getUserByEmail).toHaveBeenCalledWith(mockUser.email);
      expect(result).toEqual(mockUser);
    });

    it('should throw UnauthorizedException if credentials are invalid', async () => {
      jest
        .spyOn(usersService, 'getUserByEmail')
        .mockRejectedValue(new NotFoundException());

      await expect(
        authService.validateUser('test@example.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should handle unexpected errors during user validation', async () => {
      jest
        .spyOn(usersService, 'getUserByEmail')
        .mockRejectedValue(new Error('Database connection failed'));

      await expect(
        authService.validateUser('test@example.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('login', () => {
    it('should return DTO with user information and tokens', async () => {
      const mockUser: Partial<User> = {
        id: 1,
        email: 'test@example.com',
        role: UserRole.USER,
      };
      const mockUserInfo: User = {
        ...(mockUser as User),
        name: 'Test User',
        nickname: 'testuser',
        passwordHash: 'hashed_password',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      jest.spyOn(usersService, 'getUserById').mockResolvedValue(mockUserInfo);

      const mockNonce = '123e4567-e89b-42d3-a456-726614174000';
      jest.spyOn(crypto, 'randomUUID').mockReturnValue(mockNonce);

      jest
        .spyOn(jwtService, 'sign')
        .mockReturnValueOnce('refresh-token')
        .mockReturnValueOnce('access-token');

      const result = await authService.login(mockUser);

      expect(jwtService.sign).toHaveBeenNthCalledWith(
        1,
        {
          id: 1,
          email: 'test@example.com',
          role: UserRole.USER,
          nonce: mockNonce,
        },
        { expiresIn: '7d' },
      );

      expect(jwtService.sign).toHaveBeenNthCalledWith(
        2,
        {
          id: 1,
          email: 'test@example.com',
          role: UserRole.USER,
          nonce: mockNonce,
        },
        { expiresIn: '15m' },
      );

      expect(refreshTokenRepo.saveToken).toHaveBeenCalledWith(
        mockUser.email,
        'refresh-token',
        expect.any(Date),
      );
      expect(result).toEqual({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        user: {
          name: 'Test User',
          nickname: 'testuser',
          email: 'test@example.com',
          role: UserRole.USER,
        },
      });
    });

    it('should throw UnauthorizedException when user id is missing', async () => {
      await expect(authService.login({} as User)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(console.error).toHaveBeenCalledWith(
        'Invalid user object provided to login function',
      );
    });
  });

  describe('refreshToken', () => {
    it('should rotate refresh token and update storage', async () => {
      const mockStoredToken = {
        id: '1',
        userEmail: 'test@example.com',
        token: 'old-refresh-token',
        expiresAt: new Date(Date.now() + 86400000),
        revoked: false,
      };
      const mockUser: User = {
        id: 1,
        email: 'test@example.com',
        role: UserRole.USER,
        name: 'Test User',
        nickname: 'testuser',
        passwordHash: 'hashed_password',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdRoom: null, 
        currentRoom: null,  
      };
      jest
        .spyOn(refreshTokenRepo, 'findValidToken')
        .mockResolvedValue(mockStoredToken);
      jest.spyOn(usersService, 'getUserByEmail').mockResolvedValue(mockUser);

      const mockNonce = '123e4567-e89b-42d3-a456-726614174000';
      jest.spyOn(crypto, 'randomUUID').mockReturnValue(mockNonce);

      jest.spyOn(jwtService, 'sign').mockReturnValue('new-refresh-token');

      const result = await authService.refreshToken('old-token');

      expect(refreshTokenRepo.revokeToken).toHaveBeenCalledWith('1');
      expect(refreshTokenRepo.saveToken).toHaveBeenCalledWith(
        mockUser.email,
        'new-refresh-token',
        expect.any(Date),
      );

      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          id: 1,
          email: 'test@example.com',
          role: UserRole.USER,
          nonce: mockNonce,
        },
        { expiresIn: '15m' },
      );

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
    });
  });

  describe('validateAccessToken', () => {
    it('should verify token with correct secret', async () => {
      jest.spyOn(configService, 'get').mockReturnValue('test-secret');
      jest
        .spyOn(jwtService, 'verify')
        .mockReturnValue({ sub: 1, email: 'test@example.com' });

      const result = await authService.validateAccessToken('valid-token');

      expect(jwtService.verify).toHaveBeenCalledWith('valid-token', {
        secret: 'test-secret',
      });
      expect(result).toBe(true);
    });
  });

  describe('logout', () => {
    it('should successfully revoke refresh token', async () => {
      const mockToken = 'valid-refresh-token';
      const mockStoredToken = {
        id: 'token-id-123',
        userEmail: 'test@example.com',
        token: mockToken,
        expiresAt: new Date(Date.now() + 86400000),
        revoked: false,
      };

      jest
        .spyOn(refreshTokenRepo, 'findValidToken')
        .mockResolvedValue(mockStoredToken);
      jest.spyOn(refreshTokenRepo, 'revokeToken').mockResolvedValue();

      await authService.logout(mockToken);

      expect(refreshTokenRepo.findValidToken).toHaveBeenCalledWith(mockToken);
      expect(refreshTokenRepo.revokeToken).toHaveBeenCalledWith(
        mockStoredToken.id,
      );
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      jest.spyOn(refreshTokenRepo, 'findValidToken').mockResolvedValue(null);

      await expect(authService.logout('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(refreshTokenRepo.findValidToken).toHaveBeenCalledWith(
        'invalid-token',
      );
    });

    it('should throw InternalServerErrorException for database errors', async () => {
      jest
        .spyOn(refreshTokenRepo, 'findValidToken')
        .mockRejectedValue(new Error('Database error'));

      await expect(authService.logout('any-token')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});