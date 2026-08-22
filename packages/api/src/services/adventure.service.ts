import { AdventureRepository } from '../repositories/adventure.repository';
import { AppError } from '../errors/app-error';
import {Adventure} from '@expense-tracker/shared/src/contracts/adventure';

export class AdventureService {

  private readonly adventure: AdventureRepository

  constructor() {
    this.adventure = new AdventureRepository();
  }

  async create(input: Adventure) {

    const adventure = this.adventure.createEntity({
      userId: input.userId,
      name: input.name,
      description: input.description,
      icon: input.icon,
      backgroundColor: input.backgroundColor,
      startDate: input.startDate,
      EndDate: input.endDate,
      isComplete: input.isComplete,

    });

    return await this.adventure.save(adventure);
}


  async update(id:string,value:any){

    const is_exist = await this.adventure.find_adventure_by_id(id);
    if(!is_exist){
      return `not found any adventure with this  ${id}`;
    }
    let upadte_entity;
    try{
       await this.adventure.updateEntity(id,value);
       upadte_entity = await this.adventure.find_adventure_by_id(id);
    }catch (err){
      console.log(err);
    }
     return upadte_entity
  }

  async delete(id:string){

    const is_exist = await this.adventure.find_adventure_by_id(id);
    if(!is_exist){
      throw new AppError('Due not found', 404);
    }

     return  await this.adventure.deleteEntity(id);
  }

  async findAdventure(id:string){
    const is_exist = await this.adventure.find_adventure_by_id(id);
    if(!is_exist){
      throw new AppError('Due not found', 404);
    }

    return  await this.adventure.find_adventure_by_id(id);
  }

  async findAllAdventuresByUserId(userId:string){

    return await this.adventure.getAllAdventure(userId);

  }

}