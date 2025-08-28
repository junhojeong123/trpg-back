import { faker } from '@faker-js/faker';
import { User } from '../entities/user.entity';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../entities/user-role.enum';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserPasswordRequest } from '../dto/update-user-password.dto';
import { UpdateUserNicknameRequest } from '../dto/update-user-nickname.dto';

export const createUserDto = (): CreateUserDto => ({
    name: faker.person.fullName(),
    nickname: faker.person.firstName(),
    email: faker.internet.email(),
    password: faker.internet.password({ length: 20 }),
});

export const updateUserPasswordDto = (): UpdateUserPasswordRequest => ({
    password: faker.internet.password({ length: 20 }),
});

export const updateUserNicknameDto = (): UpdateUserNicknameRequest => ({
    nickname: faker.person.firstName(),
});

export const createUserEntity = (options: Partial<User> = {}): User => {
    const user = new User();
    user.id = options.id ?? 1;
    user.name = options.name ?? faker.person.fullName();
    user.nickname = options.nickname ?? faker.person.firstName();
    user.email = options.email ?? faker.internet.email();
    user.passwordHash =
        options.passwordHash ??
        bcrypt.hashSync(faker.internet.password({ length: 20 }), 10);
    user.role = options.role ?? UserRole.USER;
    user.createdAt = options.createdAt ?? new Date();
    user.updatedAt = options.updatedAt ?? new Date();
    user.deletedAt = options.deletedAt ?? null;
    user.createdRoom = options.createdRoom ?? undefined; // 기본 Room 생성 순환참조 조심 
    user.currentRoom = options.currentRoom ?? undefined // 기본 Room 생성
    return user;
};