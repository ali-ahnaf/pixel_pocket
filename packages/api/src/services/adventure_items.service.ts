import { AppError } from '../errors/app-error';
import {AdventureItemRepository} from '../repositories/adventure-items.repository';
import {AdventureItems} from '@expense-tracker/shared/src/contracts/adventure';
import { AdventureItem } from '../entities/AdventureItemsEntity';


export class AdventureItemService {

  private readonly adventureItem: AdventureItemRepository
  constructor() {
    this.adventureItem = new AdventureItemRepository();
  }

  async createAdventureItem(input:AdventureItems){

    const create_item= this.adventureItem.createAdventureItem({
      adventureId:input.adventureId,
      name:input.name,
      amount:input.amount,
    });

    return  await this.adventureItem.save(create_item);

  }

  async updateAdventureItem(id:string,input:AdventureItems){

    const is_exist = this.adventureItem.findAdventureItem(id)
    if(!is_exist){
      new AppError(`no item is found with this ${id}`);
    }

    return  await this.adventureItem.updateItem(id,input);


  }

  async deleteAdventureItemById(id:string){
    const is_exist = this.adventureItem.findAdventureItem(id)
    if(!is_exist){
      new AppError(`no item is found with this ${id}`);
    }

    return  await this.adventureItem.deleteItem(id);

  }

  async findAdventureItemById(id:string){
    const is_exist = this.adventureItem.findAdventureItem(id)
    if(!is_exist){
      new AppError(`no item is found with this ${id}`);
    }

    return  await this.adventureItem.findAdventureItem(id);

  }

  async findAllAdventureItems(adventureId:string){
    return await this.adventureItem.getAllAdventureItems(`${adventureId}`);
  }

}