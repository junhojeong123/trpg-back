import { MigrationInterface, QueryRunner } from "typeorm";

export class PostRefactoring1757213657585 implements MigrationInterface {
    name = 'PostRefactoring1757213657585'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "chat_messages" ("id" SERIAL NOT NULL, "room_code" character varying(50) NOT NULL, "user_id" integer NOT NULL, "nickname" character varying(100) NOT NULL, "content" text NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_40c55ee0e571e268b0d3cd37d10" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "chat_messages"`);
    }

}
