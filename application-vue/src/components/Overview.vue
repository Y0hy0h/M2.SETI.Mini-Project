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
      setInterval(() => {this.init()}, 1000)
    }

    init () {
      this.repository.getTables()
        .then(tables => this.tables = tables)
        .catch(console.error)
    }
  }
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped lang="stylus">
</style>
