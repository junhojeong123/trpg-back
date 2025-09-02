
import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * 이 마이그레이션은 
 * TRPG와 채팅을 위한 name/nickname 필드 분리 작업 완료를 기록합니다.
 * 
 *  이미 데이터베이스에 다음과 같은 변경이 적용됨:
 * - users 테이블에 name 필드 추가 (TRPG 전용)
 * - users 테이블에 nickname 필드 추가 (채팅 전용)
 * 
 *  실제 DB 변경을 수행하지 않습니다 (이미 적용됨)
 */
export class PostRefactoring1756769190294 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('PostRefactoring 마이그레이션 실행 - 기존 스키마와 일치');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('PostRefactoring 마이그레이션 롤백 - 기존 스키마와 일치');
  }
}