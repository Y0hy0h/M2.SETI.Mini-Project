export class Table {
  constructor(
    public id: number,
    public capacity: number,
    public occupied: number,
  ) {}

  get free (): number {
    return this.capacity - this.occupied;
  }
}