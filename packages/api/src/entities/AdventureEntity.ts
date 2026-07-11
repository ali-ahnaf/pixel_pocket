import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  OneToOne,
  OneToMany,
} from 'typeorm';
import { User } from './User.entity';
import {BaseEntity} from './BaseEntity';
import {AdventureItem} from './AdventureItemsEntity';

@Entity('adventures')
export class Adventure extends BaseEntity {

      @PrimaryGeneratedColumn('uuid')
      id: string;

      @Column({ type: 'varchar'  ,length: 100, nullable: false })
      userId: string;

      @Column({type:'varchar' , length: 100, nullable: false })
      name: string;

      @Column({ type: 'varchar' ,length:255, nullable: true})
      description: string | null;

      @Column({ type: 'varchar' ,length:100, nullable: true })
       icon : string | null;

      @Column({type:'varchar' ,length:50, nullable: true })
      backgroundColor: string | null;

      @Column({type:'date' , nullable: true })
      startDate: string | null;

      @Column({type:'date' , nullable: true })
      EndDate: string | null;

      @Column({type:'boolean' , nullable: true })
      isComplete: boolean;

      @ManyToOne(() =>User ,{ onDelete: 'CASCADE' })
      @JoinColumn({ name: 'userId' })
      user: User;

      @OneToMany(() => AdventureItem,(a)=>a.adventure,{
        'onDelete': 'CASCADE',
      })
      AdventureItems?: AdventureItem[];



}