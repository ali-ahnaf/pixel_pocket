import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Expense } from './Expense.entity';

import { Vault } from './Vault.entity';
import { Tag } from './Tag.entity';
import { BaseEntity } from './BaseEntity';
import {Adventure} from './AdventureEntity';

@Entity('users')
export class User extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  avatar: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  password: string | null;

  @Column({ type: 'boolean', default: false })
  disableAiPrompt: boolean;

  @Column({ type: 'boolean', default: false })
  hasOnboarded: boolean;

  @OneToMany(() => Expense, (expense) => expense.user)
  expenses: Expense[];

  @OneToMany(() => Vault, (v) => v.user)
  vaults: Vault[];

  @OneToMany(() => Tag, (t) => t.user)
  tags: Tag[];

  @OneToMany(() => Adventure, (a) => a.user)
  adventures: Adventure[];

}
