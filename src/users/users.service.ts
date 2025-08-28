import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserPasswordRequest } from './dto/update-user-password.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';
import { UpdateUserNicknameRequest } from './dto/update-user-nickname.dto';


@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) { }

  async createUser(createUserDto: CreateUserDto) {
    const { name, nickname, email, password } = createUserDto;
    const checkExist = await this.isUserExists(email);
    if (checkExist) {
      throw new ConflictException(`This email ${email} is already existed!`);
    }
    const nicknameExist = await this.isNicknameAvailable(nickname);
    if (nicknameExist) {
      throw new ConflictException(
        `This nickname ${nickname} is already existed!`,
      );
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = this.usersRepository.create({
      name: name,
      nickname: nickname,
      email: email,
      passwordHash: hashedPassword,
    });
    return this.usersRepository.save(user);
  }

  async getUserById(id: number): Promise<User> {
    return this.usersRepository.findOne({
      where: {
        id: id,
      },
      withDeleted: true,
    });
  }

  async getActiveUserById(id: number): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  // only for authenticating
  async getUserByEmail(email: string): Promise<User> {
    return this.usersRepository
      .findOne({
        where: { email: email },
        select: ['id', 'email', 'passwordHash', 'name', 'nickname', 'role']
      })
      .then((user) => {
        if (user) {
          return user;
        } else {
          throw new NotFoundException(
            `This email ${email} user could not be found`,
          );
        }
      });
  }

  async isUserExists(email: string): Promise<boolean> {
    return this.usersRepository
      .findOne({
        where: { email: email },
        withDeleted: true,
      })
      .then((user) => {
        if (user) {
          return true;
        } else {
          return false;
        }
      });
  }

  async isNicknameAvailable(nickname: string): Promise<boolean> {
    return this.usersRepository
      .findOne({
        where: { nickname: nickname },
        withDeleted: true,
      })
      .then((user) => {
        if (user) {
          return true;
        } else {
          return false;
        }
      });
  }

  async updateUserNickname(
    userId: number,
    updateDto: UpdateUserNicknameRequest,
  ): Promise<User> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new NotFoundException('This user could not be found.');
    }

    const nicknameExist = await this.isNicknameAvailable(updateDto.nickname);

    if (nicknameExist) {
      throw new ConflictException(
        `This nickname ${updateDto.nickname} is already existed!`,
      );
    }

    user.nickname = updateDto.nickname;
    return this.usersRepository.save(user);
  }

  async updateUserPassword(
    userId: number,
    updateDto: UpdateUserPasswordRequest,
  ): Promise<User> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new NotFoundException('This user could not be found.');
    }
    const hashedPassword = await bcrypt.hash(updateDto.password, 10);
    user.passwordHash = hashedPassword;
    return this.usersRepository.save(user);
  }

  async softDeleteUser(userId: number): Promise<void> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new NotFoundException('This user could not be found.');
    }
    const result = await this.usersRepository.softDelete(userId);
    if (result.affected !== 1) {
      throw new InternalServerErrorException('Internal Server Error');
    }
  }
}