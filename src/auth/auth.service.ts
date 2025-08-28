import { UsersService } from '../users/users.service';
import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt'; // 
import { RefreshTokenRepository } from './refresh-token.repository';
import { jwtPayloadDto } from './types/jwt-payload.dto';
import { User } from '../users/entities/user.entity';
import { Transactional } from 'typeorm-transactional';
import { LoginResponseDto } from './dto/login-response.dto';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly refreshTokenRepo: RefreshTokenRepository,
  ) {}

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.usersService.getUserByEmail(email).catch(() => {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다');
    });

    //  안전한 비밀번호 비교 (try-catch 추가)
    let isMatch = false;
    try {
      if (!user.passwordHash) {
        this.logger.error(`비밀번호 필드 누락 - 사용자 ID: ${user.id}`);
        throw new InternalServerErrorException('비밀번호 검증 시스템 오류');
      }
      
      isMatch = await bcrypt.compare(password, user.passwordHash);
    } catch (error) {
      this.logger.error(`비밀번호 검증 실패 (이메일: ${email}): ${error.message}`);
      
      // 평문 비밀번호 저장된 계정 감지
      if (error.message.includes('Illegal arguments')) {
        throw new InternalServerErrorException(
          '비밀번호 저장 시스템 오류 - 관리자에게 문의하세요',
        );
      }
      
      throw new InternalServerErrorException('비밀번호 검증 시스템 오류');
    }

    if (isMatch) {
      return user;
    } else {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다');
    }
  }

  @Transactional()
  async login(user: Partial<User>): Promise<LoginResponseDto> {
    const userId = user.id;
    if (!userId) {
      this.logger.error('로그인 요청에 유효하지 않은 사용자 객체 제공');
      throw new UnauthorizedException('인증 정보가 올바르지 않습니다');
    }

    let userInfo: User;
    try {
      userInfo = await this.usersService.getUserById(userId);
    } catch (error) {
      this.logger.error(`데이터베이스 오류 (사용자 ID: ${userId}): ${error.message}`);
      throw new InternalServerErrorException(
        '로그인 처리 중 데이터베이스 오류가 발생했습니다',
      );
    }

    if (!userInfo) {
      this.logger.error(`로그인 시도 실패 - 사용자 ID: ${userId} 없음`);
      throw new UnauthorizedException('인증 정보가 올바르지 않습니다');
    }

    const payload: jwtPayloadDto = {
      id: userInfo.id,
      email: userInfo.email,
      role: userInfo.role,
      nonce: crypto.randomUUID(),
    };

    try {
      const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await this.refreshTokenRepo.saveToken(
        userInfo.email,
        refreshToken,
        expiresAt,
      );

      this.logger.log(`로그인 성공 - 사용자 ID: ${userInfo.id}, 이메일: ${userInfo.email}`);
      
      return {
        access_token: this.jwtService.sign(payload, { expiresIn: '15m' }),
        refresh_token: refreshToken,
        user: {
          name: userInfo.name,
          nickname: userInfo.nickname,
          email: userInfo.email,
          role: userInfo.role,
        },
      };
    } catch (error) {
      this.logger.error(
        `토큰 생성 실패 (사용자 ID: ${userId}): ${error.message}`,
      );
      throw new InternalServerErrorException(
        '인증 토큰 생성에 실패했습니다',
      );
    }
  }

  @Transactional()
  async refreshToken(token: string) {
    try {
      const storedToken = await this.refreshTokenRepo.findValidToken(token);
      if (!storedToken || new Date() > storedToken.expiresAt) {
        throw new UnauthorizedException('유효하지 않은 리프레시 토큰입니다');
      }

      await this.refreshTokenRepo.revokeToken(storedToken.id);

      const user = await this.usersService.getUserByEmail(
        storedToken.userEmail,
      );
      const payload = {
        id: user.id,
        email: user.email,
        role: user.role,
        nonce: crypto.randomUUID(),
      } satisfies jwtPayloadDto;
      const newRefreshToken = this.jwtService.sign(payload, {
        expiresIn: '7d',
      });
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      await this.refreshTokenRepo.saveToken(
        user.email,
        newRefreshToken,
        expiresAt,
      );

      this.logger.log(`토큰 갱신 성공 - 사용자 이메일: ${user.email}`);
      
      return {
        access_token: this.jwtService.sign(payload, { expiresIn: '15m' }),
        refresh_token: newRefreshToken,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      this.logger.error(`토큰 갱신 실패: ${error.message}`);
      throw new InternalServerErrorException('토큰 처리 중 문제가 발생했습니다');
    }
  }

  async validateAccessToken(token: string): Promise<boolean> {
    try {
      // ✅ 보안 강화: JWT_SECRET 필수 검증
      const secret = this.configService.getOrThrow<string>('JWT_SECRET');
      
      this.jwtService.verify(token, { secret });
      return true;
    } catch (error) {
      this.logger.warn(`토큰 검증 실패: ${error.message}`);
      return false;
    }
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const storedToken =
        await this.refreshTokenRepo.findValidToken(refreshToken);
      if (!storedToken) {
        throw new UnauthorizedException('유효하지 않은 리프레시 토큰입니다');
      }
      await this.refreshTokenRepo.revokeToken(storedToken.id);
      
      this.logger.log(`로그아웃 성공 - 토큰 ID: ${storedToken.id}`);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      this.logger.error(`로그아웃 실패: ${error.message}`);
      throw new InternalServerErrorException('로그아웃 처리에 실패했습니다');
    }
  }
}