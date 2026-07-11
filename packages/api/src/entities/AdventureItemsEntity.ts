import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import {BaseEntity} from './BaseEntity';
import {Adventure} from './AdventureEntity';


@Entity('adventure_items')
export class AdventureItem extends BaseEntity {

  @PrimaryGeneratedColumn('uuid')
  id:string;

  @Column({ type: 'varchar' , nullable: false })
  adventureId: string;

  @Column ({type :'varchar',length:100})
  name : string

  @Column({type:'decimal', precision:10 , scale:2 })
  amount : number;

  @ManyToOne(() => Adventure, (a)=>a.AdventureItems)
  @JoinColumn({ name: 'adventure_id' })
  adventure: Adventure;


}
