import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User, UserRole } from './src/database/entities/user.entity';
import { Company }         from './src/database/entities/company.entity';
import { OtpCode }         from './src/database/entities/otp-code.entity';
import * as bcrypt         from 'bcryptjs';
import * as dotenv         from 'dotenv';

dotenv.config({ path: '../../.env' });

const ds = new DataSource({
  type:        'postgres',
  host:        process.env.POSTGRES_HOST || 'localhost',
  port:        Number(process.env.POSTGRES_PORT) || 5432,
  username:    process.env.POSTGRES_USER,
  password:    process.env.POSTGRES_PASSWORD,
  database:    process.env.POSTGRES_DB,
  entities:    [User, Company, OtpCode],
  synchronize: true,
});

async function seed() {
  await ds.initialize();
  const repo = ds.getRepository(User);

  const exists = await repo.findOne({ where: { role: UserRole.SUPER_ADMIN } });
  if (exists) {
    console.log('✅ Super admin already exists');
  } else {
    await repo.save(repo.create({
      firstName:       'Super',
      lastName:        'Admin',
      email:           'admin@qurelio.com',
      passwordHash:    await bcrypt.hash('SuperAdmin@2024!', 12),
      role:            UserRole.SUPER_ADMIN,
      isEmailVerified: true,
      isActive:        true,
    }));
    console.log('✅ Super admin created → admin@qurelio.com / SuperAdmin@2024!');
  }

  await ds.destroy();
}

seed().catch((e) => { console.error(e); process.exit(1); });
