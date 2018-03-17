import Axios from 'axios'

import { Table } from '@/model/table'

export class Repository {
  private url = 'http://192.168.0.58/serveur/process.php'

  async getJson (): Promise<any[]> {
    const response = await Axios.get(this.url)
    return response.data
  }

  async getTables (): Promise<Table[]> {
    const json = await this.getJson()
    return json.map(rawTable => {
      return new Table(
        rawTable.id,
        parseInt(rawTable.capacity),
        parseInt(rawTable.occupied_places),
      )
    })
  }
}