<template>
    <div class="overview">
        <div class="header">
            <h1 class="title">FastResto</h1>
        </div>
        <img class="background-image" src="../assets/background.jpg"/>
        <div class="tables">
            <TableView v-for="table in tables" :key="table.id" :table-data="table"
                       :requested-places="requestedPlaces"></TableView>
        </div>
        <div class="input">
            <span class="left">Je cherche</span>
            <button class="minus"
                    @click="decrement()"
                    :disabled="requestedPlaces <= minimumRequestedPlaces"
            >
                -
            </button>
            <span class="amount"
                  :class="{invalid: !requestedPlacesFound}">{{ requestedPlaces }}</span>
            <button class="plus"
                    @click="increment()"
                    :disabled="requestedPlaces >= maxCapacity"
            >
                +
            </button>
            <span class="right">place{{ requestedPlaces === 1 ? '' : 's'}}.</span>
        </div>
    </div>
</template>

<script lang="ts">
  import { cloneDeep } from 'lodash'

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
    private fakeTables = [
      new Table(-100, 4, 3),
      new Table(-101, 4, 4),
      new Table(-102, 4, 2),
      new Table(-103, 4, 4),
      new Table(-104, 4, 3),
      new Table(-105, 4, 1),
      new Table(-106, 4, 2),
      new Table(-107, 4, 4),
    ]
    private realTables: Table[] = [
      new Table(1, 4, 0),
      new Table(2, 4, 1)
    ]

    get tables (): Table[] {
      const tables = cloneDeep(this.fakeTables)
      tables.splice(2, 0, ...this.realTables)
      return tables

    }

    private live = false

    private requestedPlaces = 3
    private minimumRequestedPlaces = 0

    get requestedPlacesFound (): boolean {
      for (const table of this.tables) {
        if (table.free >= this.requestedPlaces) {
          return true
        }
      }
      return false
    }

    get maxCapacity (): number {
      const capacities = this.tables.map(table => table.capacity)
      return Math.max(...capacities)
    }

    mounted () {
      // If can connect, set live
      this.repository.getTables()
        .then(
          tables => {
            this.realTables = tables
            this.live = true
            setInterval(() => {
              if (this.live) {
                this.init()
              }
            }, 1000)
          }
        )
        .catch(error => {
          console.error(error)
          console.log('There was an error fetching the data, using fake data instead.')
        })

    }

    init () {
      this.repository.getTables()
        .then(tables => {
          this.realTables = tables
        })
        .catch(console.error)
    }

    decrement () {
      this.requestedPlaces--
      if (this.requestedPlaces < this.minimumRequestedPlaces) {
        this.requestedPlaces = this.minimumRequestedPlaces
      }
    }

    increment () {
      this.requestedPlaces++
      if (this.requestedPlaces > this.maxCapacity) {
        this.requestedPlaces = this.maxCapacity
      }
    }
  }
</script>

<style scoped lang="stylus">

    $base-color = #E9EEBA

    .banner
        display: flex
        align-items: baseline
        font-size: 22px
        color: $base-color
        padding-top: 12px
        padding-bottom: 12px
        background-color: rgba(0, 0, 0, 0.8)
        align-content: center

    .header
        @extends .banner
        padding-left: 48px
        margin-bottom: 12px

    .input
        @extends .banner
        justify-content: center
        position: fixed
        width: 100%
        bottom: 0

        span.left, span.right
            flex: 1

        span.left
            text-align: right
        span.right
            text-align: left

        .amount
            font-family: monospace

            &.invalid
                color: red

        button
            background: None
            border: 1px solid rgba(255, 255, 255, 0.1)
            outline: 0
            color: $base-color
            width: 2em
            height: 2em
            margin-left: 0.5em
            margin-right: 0.5em

            &::-moz-focus-inner
                border: 0

            &:hover
                background: rgba(255, 255, 255, 0.1)

            &:disabled
                color: $base-color
                opacity: .3

    .title
        font-size: 2em
        font-style: italic
        margin: 0

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
        justify-content: center
</style>
