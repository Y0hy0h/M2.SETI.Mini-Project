<template>
    <div class="overview">
        <img class="background-image" src="../assets/background.jpg"/>
        <span v-if="tables.length === 0" class="loading">Chargement...</span>
        <TableView v-else v-for="table in tables" :key="table.id" :table-data="table"></TableView>
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
    private baseTables = [
      new Table(100, 4, 3),
      new Table(101, 4, 1),
      new Table(102, 4, 0),
      new Table(103, 4, 1),
      new Table(104, 4, 0),
      new Table(105, 4, 0),
      new Table(106, 4, 0),
      new Table(107, 4, 4),
    ]
    private tables: Table[] = this.baseTables
    private live = true

    mounted () {
      setInterval(() => {
        if (this.live) {
          this.init()
        }
      }, 1000)
    }

    init () {
      this.repository.getTables()
        .then(tables => {
          for (let i = 0; i < tables.length; i++) {
            this.tables[i] = tables[i]
          }
        })
        .catch()
    }
  }
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped lang="stylus">
    .overview
        display: flex
        flex-wrap wrap

    .background-image
        position: fixed
        filter: blur(7px) brightness(50%);
        min-height: 110%
        min-width: 110%
        width: 110%
        height: auto
        top: -10px
        left: -10px
        z-index: -1

    .loading
        font-size: 2em
        font-weight: bolder
        color: #E9EEBA
        position: absolute
        top: 50%
        left: 50%
        transform: translate(-50%, -50%);
</style>
