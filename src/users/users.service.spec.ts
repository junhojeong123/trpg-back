// src/users/users.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  createUserDto,
  updateUserNicknameDto,
  updateUserPasswordDto,
} from './factory/user.factory';
import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UpdateUserNicknameRequest } from './dto/update-user-nickname.dto';

// bcrypt 모킹
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockImplementation((str, salt) => Promise.resolve(`hashed_${str}`)),
  compare: jest.fn().mockImplementation((str, hash) => Promise.resolve(true)),
}));

describe('UsersService', () => {
  let service: UsersService;
  let repository: Repository<User>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useClass: Repository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('signUpUser', () => {
    const userDtoForCreate = createUserDto();
    const { name, email, nickname, password } = userDtoForCreate;
    const hashedPassword = 'hashed_' + password;
    const user = {
      name: name,
      nickname: nickname,
      email: email,
      passwordHash: hashedPassword,
    };

    it('should create a new user successfully', async () => {
      jest.spyOn(service, 'isUserExists').mockResolvedValue(false);
      jest.spyOn(service, 'isNicknameAvailable').mockResolvedValue(false);
      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      jest.spyOn(repository, 'create').mockReturnValue(user as User);
      jest.spyOn(repository, 'save').mockResolvedValue(user as User);

      const result = await service.createUser(userDtoForCreate);

      expect(result).toEqual(user);
      expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
        name,
        nickname,
        email,
      }));
      expect(repository.save).toHaveBeenCalledWith(expect.objectContaining(user));
      expect(bcrypt.hash).toHaveBeenCalledWith(password, 10);
    });

    it('should throw an error if email already exists', async () => {
      jest.spyOn(service, 'isUserExists').mockResolvedValue(true);

      await expect(service.createUser(userDtoForCreate)).rejects.toThrow(
        new ConflictException(`This email ${email} is already existed!`),
      );
    });

    it('should throw an error if nickname already exists', async () => {
      jest.spyOn(service, 'isUserExists').mockResolvedValue(false);
      jest.spyOn(service, 'isNicknameAvailable').mockResolvedValue(true);

      await expect(service.createUser(userDtoForCreate)).rejects.toThrow(
        new ConflictException(`This nickname ${nickname} is already existed!`),
      );
    });
  });

  describe('getUserById', () => {
    it('should return a user if found', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        nickname: 'testuser',
        passwordHash: 'hashed_password',
        role: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      } as User;

      jest.spyOn(repository, 'findOne').mockResolvedValue(mockUser);

      const result = await service.getUserById(mockUser.id);

      expect(result).toEqual(mockUser);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        withDeleted: true,
      });
    });

    it('should return null if no user is found', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(null);

      await expect(service.getUserById(999)).resolves.toBeNull();
    });
  });

  describe('findUserByEmail', () => {
    it('should return a user if found', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        nickname: 'testuser',
        passwordHash: 'hashed_password',
        role: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      } as User;
      const email = mockUser.email;

      jest.spyOn(repository, 'findOne').mockResolvedValue(mockUser);

      const result = await service.getUserByEmail(email);

      expect(result).toEqual(mockUser);
      // select 옵션이 자동으로 추가될 수 있으므로 유연하게 검증
      expect(repository.findOne).toHaveBeenCalledWith(expect.objectContaining({
        where: { email },
      }));
    });

    it('should throw NotFoundException Error if no user is found', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(null);

      await expect(
        service.getUserByEmail('nonexistent@example.com'),
      ).rejects.toThrow(
        new NotFoundException(
          'This email nonexistent@example.com user could not be found',
        ),
      );
    });
  });

  describe('isUserExists', () => {
    it('should return true if user exists', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        nickname: 'testuser',
        passwordHash: 'hashed_password',
        role: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      } as User;
      jest.spyOn(repository, 'findOne').mockResolvedValue(mockUser);

      const result = await service.isUserExists(mockUser.email);

      expect(result).toBeTruthy();
    });

    it('should return false if user does not exist', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(null);

      const result = await service.isUserExists('nonexistent@example.com');

      expect(result).toBeFalsy();
    });
  });

  describe('updateNickname', () => {
    it('should update user nickname successfully', async () => {
      const UpdateUserNicknameRequest = updateUserNicknameDto();

      const user = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        nickname: 'oldNickname',
        passwordHash: 'hashed_password',
        role: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      } as User;
      const newNickname = UpdateUserNicknameRequest.nickname;

      jest.spyOn(service, 'getUserById').mockResolvedValue(user);
      jest.spyOn(service, 'isNicknameAvailable').mockResolvedValue(false);
      jest.spyOn(repository, 'save').mockResolvedValue({
        ...user,
        nickname: newNickname,
      } as User);

      const result = await service.updateUserNickname(
        user.id,
        UpdateUserNicknameRequest,
      );
      expect(result.nickname).toBe(newNickname);
      expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
        ...user,
        nickname: newNickname,
      }));
    });

    it('should throw NotFoundException if user does not exist', async () => {
      jest.spyOn(service, 'getUserById').mockResolvedValue(null);

      await expect(
        service.updateUserNickname(1111, {
          nickname: 'newNickname',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if nickname is already existed.', async () => {
      const user = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        nickname: 'oldNickname',
        passwordHash: 'hashed_password',
        role: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      } as User;

      jest.spyOn(service, 'getUserById').mockResolvedValue(user);
      jest.spyOn(service, 'isNicknameAvailable').mockResolvedValue(true);

      await expect(
        service.updateUserNickname(1, {
          nickname: 'duplicatedNickname',
        } satisfies UpdateUserNicknameRequest),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updatePassword', () => {
    it('should update user password successfully', async () => {
      const UpdateUserPasswordRequest = updateUserPasswordDto();
      const hashedPassword = 'hashed_' + UpdateUserPasswordRequest.password;
      const user = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        nickname: 'testuser',
        passwordHash: 'old_hashed_password',
        role: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      } as User;

      jest.spyOn(service, 'getUserById').mockResolvedValue(user);
      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      jest
        .spyOn(repository, 'save')
        .mockResolvedValue({ ...user, passwordHash: hashedPassword } as User);

      const result = await service.updateUserPassword(
        user.id,
        UpdateUserPasswordRequest,
      );
      expect(result.passwordHash).toBe(hashedPassword);
      expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
        ...user,
        passwordHash: hashedPassword,
      }));
      expect(bcrypt.hash).toHaveBeenCalledWith(UpdateUserPasswordRequest.password, 10);
    });

    it('should throw NotFoundException if user does not exist', async () => {
      jest.spyOn(service, 'getUserById').mockResolvedValue(null);

      await expect(
        service.updateUserPassword(1111, {
          password: 'newPassword',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteAccount', () => {
    it('should remove user account successfully', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        nickname: 'testuser',
        passwordHash: 'hashed_password',
        role: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      } as User;

      jest.spyOn(service, 'getUserById').mockResolvedValue(mockUser);
      jest.spyOn(repository, 'softDelete').mockResolvedValue({
        raw: [],
        affected: 1,
        generatedMaps: [],
      });

      const result = await service.softDeleteUser(mockUser.id);

      expect(result).toBeUndefined();
      expect(service.getUserById).toHaveBeenCalledWith(mockUser.id);
      expect(repository.softDelete).toHaveBeenCalledWith(mockUser.id);
    });

    it('should throw NotFoundException if user does not exist', async () => {
      jest.spyOn(service, 'getUserById').mockResolvedValue(null);

      await expect(service.softDeleteUser(11111)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw InternalServerErrorException when deleting user occurs error.', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        nickname: 'testuser',
        passwordHash: 'hashed_password',
        role: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      } as User;

      jest.spyOn(service, 'getUserById').mockResolvedValue(mockUser);
      jest.spyOn(repository, 'softDelete').mockResolvedValue({
        raw: [],
        affected: 0,
        generatedMaps: [],
      });

      await expect(service.softDeleteUser(mockUser.id)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});