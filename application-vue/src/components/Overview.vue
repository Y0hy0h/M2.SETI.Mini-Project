<template>
    <div class="overview">
        <div class="header">
            <h1 class="title">FastResto</h1>
            <span class="subtitle">Trouver. Manger. Continuer.</span>
        </div>
        <img class="background-image" src="../assets/background.jpg"/>
        <div class="tables">
            <FakeTableView v-for="table in fakeTables.slice(0, 1)" :key="table.id"
                           :table-data="table"></FakeTableView>
            <TableView v-for="table in tables" :key="table.id" :table-data="table"></TableView>
            <FakeTableView v-for="table in fakeTables.slice(1)" :key="table.id"
                           :table-data="table"></FakeTableView>
        </div>
    </div>
</template>

<script lang="ts">
  import { Component, Vue } from 'vue-property-decorator'
  import TableView from '@/components/TableView.vue'
  import FakeTableView from '@/components/FakeTableView.vue'
  import { Repository } from '@/model/repository'
  import { Table } from '@/model/table'

  @Component({
    components: {
      TableView,
      FakeTableView,
    }
  })
  export default class Overview extends Vue {
    private repository = new Repository()
    private fakeTables = [
      new Table(100, 4, 3),
      new Table(101, 4, 4),
      new Table(102, 4, 2),
      new Table(103, 4, 4),
      new Table(104, 4, 3),
      new Table(105, 4, 1),
      new Table(106, 4, 2),
      new Table(107, 4, 4),
    ]
    private tables: Table[] = [
      new Table(1, 4, 0),
      new Table(2, 4, 1)
    ]
    private live = false

    mounted () {
      // If can connect, set live
      this.repository.getTables()
        .then(
          tables => {
            this.tables = tables
            this.live = true
            setInterval(() => {
              if (this.live) {
                this.init()
              }
            }, 1000)
          }
        )
        .catch(console.error)

    }

    init () {
      this.repository.getTables()
        .then(tables => {
          this.tables = tables
        })
        .catch()
    }
  }
</script>

<style scoped lang="stylus">
    .header
        display: flex
        align-items: baseline
        font-size: 22px
        color: #E9EEBA
        padding-top: 12px
        padding-bottom: 12px
        padding-left: 48px
        margin-bottom: 12px
        background-color: rgba(0, 0, 0, 0.8)
        align-content: center

    .title
        font-size: 2em
        font-style: italic
        margin: 0

    .subtitle
        margin-left: 1em
        opacity: .8
        font-size: 1em
        font-weight: lighter

    .overview
        display: flex
        flex-wrap: wrap
        flex-direction: column

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

    .tables
        display: flex
        flex-wrap: wrap
</style>
