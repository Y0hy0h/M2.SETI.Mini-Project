<template>
    <div>
        <TableView v-for="table in tables" :key="table.id" :table-data="table"></TableView>
    </div>
</template>

<script lang="ts">
  import { Component, Vue } from 'vue-property-decorator'
  import TableView from '@/components/TableView.vue'
  import { Repository } from '@/model/repository'
  import { Table } from '@/model/table'

  @Component({
    components: {
      TableView,
    }
  })
  export default class Overview extends Vue {
    private repository = new Repository()
    private tables: Table[] = []

    mounted () {
      this.init()
        .catch(console.error)
    }

    async init () {
      this.tables = await this.repository.getTables()
    }
  }
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped lang="stylus">
</style>
