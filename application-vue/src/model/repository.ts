import { Table } from '@/model/table'

export class Repository {
  private url = 'http://192.168.0.58/serveur/process.php'

  async getJson (): Promise<any[]> {
    let response = await fetch(this.url)
    return await response.json()
  }

  async getTables (): Promise<Table[]> {
    const json = await this.getJson()
    const tables = json.map(rawTable => {
      return new Table(
        rawTable.id,
        parseInt(rawTable.capacity),
        parseInt(rawTable.occupied_places),
      )
    })
    return tables
  }
}