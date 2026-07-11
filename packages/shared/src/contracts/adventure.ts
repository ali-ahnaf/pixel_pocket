export interface Adventure {
  userId: string | null;
  name: string | null;
  description: string | null;
  icon:string | null;
  backgroundColor: string | null;
  startDate:string | null;
  endDate:string | null;
  isComplete: boolean;
}

export interface AdventureItems {
  adventureId: string;
  name: string;
  amount: number;

}