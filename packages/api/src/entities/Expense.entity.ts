import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { User } from './User.entity';
import { Vault } from './Vault.entity';
import { TransactionTag } from './TransactionTag.entity';
import { BaseEntity } from './BaseEntity';
import { TransactionType } from '@expense-tracker/shared';

export type RecurrenceInterval = 'weekly' | 'monthly' | 'daily' | 'yearly';
export type { TransactionType };

@Entity('expenses')
export class Expense extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  title: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  amount: number;

  @Column({ type: 'varchar', default: 'expense' })
  type: TransactionType;

  @Column({ type: 'date', nullable: true })
  date: string;

  @Column({ type: 'varchar', nullable: true })
  interval: RecurrenceInterval;

  @Column({ type: 'date', nullable: true })
  startDate: string;

  @Column({ type: 'date', nullable: true })
  endDate: string;

  @Column({ type: 'varchar', nullable: true })
  vaultId: string | null;

  @Column({ type: 'varchar', nullable: true })
  sourceRecurringId: string | null;

  @ManyToOne(() => User, (user) => user.expenses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Vault, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vaultId' })
  vault: Vault | null;

  @OneToMany(() => TransactionTag, (transactionTag) => transactionTag.transaction)
  transactionTags: TransactionTag[];
}
