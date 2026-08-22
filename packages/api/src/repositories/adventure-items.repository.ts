import { DataSource, FindManyOptions, IsNull, Not, Repository } from 'typeorm';
import { AppDataSource } from '../data-source';
import {AdventureItem} from '../entities/AdventureItemsEntity';

export class AdventureItemRepository{
  constructor(private readonly datasource:DataSource= AppDataSource) {}
  private get repo():Repository<AdventureItem>{
    return this.datasource.getRepository(AdventureItem);
  }

  createAdventureItem(input:any){

    return this.repo.create(input)

  }

  save(adventure: any) {
    return this.repo.save(adventure);
  }

  findAdventureItem(id:string){
    return this.repo.findOneBy({id})
  }

  updateItem(id:string,input:any){
    return this.repo.update(id ,input)
  }

  deleteItem(id:string){
    return this.repo.delete(id)
  }

  getAllAdventureItems(adventureId:string){
    return this.repo.find({
      where:{
        adventureId: adventureId
      }
    })
  }



}