import { DataSource, FindManyOptions, IsNull, Not, Repository } from 'typeorm';
import { AppDataSource } from '../data-source';

import {Adventure} from "../entities/AdventureEntity"

export class AdventureRepository{
   constructor(private readonly datasource:DataSource= AppDataSource) {}
   private get repo():Repository<Adventure>{
     return this.datasource.getRepository(Adventure);
  }

  createEntity(data:any){
     return this.repo.create(data);
  }

  save(adventure: any) {
    return this.repo.save(adventure);
  }

  find_adventure_by_id(id:string){
     return this.repo.findOneBy({id})
  }

  updateEntity(id:string,data:any){
     return this.repo.update(id ,data)
  }

  deleteEntity(id:string){
     return this.repo.delete(id)
  }

  getAllAdventure(userId:string){
     return this.repo.find({
       where:{
         userId: userId
       }
     })
  }

}