import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { User } from './User.entity';
import { BaseEntity } from './BaseEntity';

@Entity('user_preferences')
export class UserPreference extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  userId: string;

  @Column({ type: 'boolean', default: false })
  showIncome: boolean;

  @Column({ type: 'boolean', default: false })
  showExpense: boolean;

  @Column({ type: 'boolean', default: false })
  pushEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  aiTransactionEntryEnabled: boolean;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
