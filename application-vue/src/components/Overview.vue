<template>
    <div class="overview">
        <div class="header">
            <h1 class="title">FastResto</h1>
            <span class="subtitle">Trouver. Manger. Continuer.</span>
        </div>
        <img class="background-image" src="../assets/background.jpg"/>
        <span v-if="tables.length === 0" class="loading">Chargement...</span>
        <div v-else class="tables">
            <TableView v-for="table in tables" :key="table.id" :table-data="table"></TableView>
        </div>
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

<style scoped lang="stylus">
    .header
        font-size: 22px
        color: #E9EEBA
        padding-top: 12px
        padding-bottom: 12px
        padding-left: 48px
        margin-bottom: 12px
        background-color: rgba(0, 0, 0, 0.8)

    .title
        font-size: 2em
        display: inline
        font-style: italic

    .subtitle
        margin-left: 1.5em
        filter: brightness(75%)
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

    .loading
        font-size: 2em
        font-weight: bolder
        color: #E9EEBA
        position: absolute
        top: 50%
        left: 50%
        transform: translate(-50%, -50%);

    .tables
        display: flex
        flex-wrap: wrap
</style>
