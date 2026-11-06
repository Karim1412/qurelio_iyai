import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

export type AccessRuleKind = 'ROLE' | 'DEPARTMENT' | 'USER';

@Entity('document_access_rules')
@Index(['companyId', 'documentId'])
export class DocumentAccessRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id' })
  companyId!: string;

  @Column({ name: 'document_id' })
  documentId!: string;

  @Column({ type: 'varchar', length: 16 })
  kind!: AccessRuleKind;

  @Column({ name: 'role_ref', nullable: true })
  roleRef?: string;

  @Column({ nullable: true })
  department?: string;

  @Column({ name: 'user_id', nullable: true })
  userId?: string;
}
