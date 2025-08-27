<<<<<<< HEAD
## Installed Package
```bash
# pnpm ls   <-- 이걸로 확인가능
# typeorm, bcryptjs,config,typeorm-extension,dotenv, passport-jwt, types/passport-jwt등 깔면된다
dependencies:
@nestjs/common 11.1.0            @nestjs/passport 11.0.5          joi 17.13.3                      typeorm 0.3.23
@nestjs/config 4.0.2             @nestjs/platform-express 11.1.0  passport-jwt 4.0.1               typeorm-extension 3.7.1
@nestjs/core 11.1.0              @nestjs/typeorm 11.0.0           pg 8.15.6                        typeorm-naming-strategies 4.1.0      
@nestjs/jwt 11.0.0               bcryptjs 3.0.2                   reflect-metadata 0.2.2
@nestjs/mapped-types 2.1.0       dotenv 16.5.0                    rxjs 7.8.2

devDependencies:
@eslint/eslintrc 3.3.1         @types/jest 29.5.14            eslint-config-prettier 10.1.5  ts-loader 9.5.2
@eslint/js 9.26.0              @types/node 22.15.17           eslint-plugin-prettier 5.4.0   ts-node 10.9.2
@nestjs/cli 11.0.7             @types/passport 1.0.17         globals 16.1.0                 tsconfig-paths 4.2.0
@nestjs/schematics 11.0.5      @types/passport-jwt 4.0.1      jest 29.7.0                    typescript 5.8.3
@nestjs/testing 11.1.0         @types/supertest 6.0.3         prettier 3.5.3                 typescript-eslint 8.32.0
@swc/cli 0.6.0                 class-transformer 0.5.1        source-map-support 0.5.21
@swc/core 1.11.24              class-validator 0.14.2         supertest 7.1.0
@types/express 5.0.1           eslint 9.26.0                  ts-jest 29.3.2
```

## 의존성 설치 및 마아그레이션션 => DB를 수정할때마다 revert 후에 다시 생성 및 시작 
```bash
pnpm install
pnpm run migration:generate
pnpm run migration:run

# 마이그레이션 롤백
pnpm run migration:revert

```

## DB
```bash
.env.example에서 바꿔야하는 부분을 수정 
NODE_ENV는 자신이 만들 env.sample에서 sample 부분을 경로 지정하는 것  
post는 자기가 설정한 포트로
postgresql 부분과 DATABASE_DBNAME 수정
DB쪽은 database까지만 만들면 나머지는 마이그레이션을 통해 생성
JWT_SECRE => 여기서는는 임의로 작성 ex) dffe#@WWQ23d
추가사항
```
=======
﻿# Chat Backend
바뀐건 main.ts app.controller.ts chat.gateway.ts chat.module.ts 이고 추가된게 rate-limit.service.ts 입니다
>>>>>>> chat-main-branch
