<template>
    <div class="table">
        <svg version="1.1"
             baseProfile="full"
             :width="size" :height="size"
             viewbox="0 0 200 200"
             xmlns="http://www.w3.org/2000/svg"
             ref="canvas"
        >
            <circle v-bind="tableShape"></circle>
            <circle v-for="placeShape in placeShapes" v-bind="placeShape"></circle>
        </svg>
        <span class="places-left" v-show="!fake">{{tableData.free}}/{{tableData.capacity}}</span>
    </div>
</template>

<script lang="ts">
  import Color from 'color'

  import { Component, Prop, Vue } from 'vue-property-decorator'
  import { Table } from '@/model/table'

  @Component
  export default class TableView extends Vue {
    @Prop() private tableData!: Table
    @Prop() private requestedPlaces!: number

    get fake (): boolean {
      return this.tableData.id < 0
    }

    get places (): number[] {
      const amount = this.tableData.capacity
      const places = new Array(amount)
      for (let i = 0; i < amount; i++) {
        places[i] = i
      }
      return places
    }

    private randomForPlace: number[]

    private colorFree = Color('#eeeeee')
    private colorOccupied = Color('#777777')
    private colorSelected = Color('#efdc05')

    private size = 275

    get tableShape () {
      let color = this.colorFree.mix(this.colorOccupied, this.tableData.occupied / this.tableData.capacity)
      if (0 < this.requestedPlaces && this.requestedPlaces <= this.tableData.free) {
        color = this.colorSelected
      }
      return {
        cx: this.size / 2,
        cy: this.size / 2,
        r: this.size * 0.5 / 2,
        fill: color,
      }
    }

    get placeShapes (): object[] {
      return [...Array(this.tableData.capacity).keys()].map(this.getPlaceShape)
    }

    getPlaceShape (place: number) {
      let color = this.colorFree
      const isSelected = this.requestedPlaces <= this.tableData.free
        && place < this.tableData.occupied + this.requestedPlaces
      if (isSelected) {
        color = this.colorSelected
      }
      const occupied = place < this.tableData.occupied
      if (occupied) {
        color = this.colorOccupied
      }

      const radius = this.size * 0.15 / 2
      const yTranslation = this.tableShape.r + radius + 10
      const rotation = (place / this.tableData.capacity) * 360 - 135
        + Math.floor(this.randomForPlace[place] * 15)

      return {
        cx: 0,
        cy: yTranslation,
        r: radius,
        fill: color,
        transform: `translate(${this.size / 2}, ${this.size / 2}) rotate(${rotation})`
      }
    }

    constructor () {
      super()
      this.randomForPlace = this.places.map(() => Math.random())
    }
  };
</script>

<style scoped lang="stylus">

    .table
        position: relative
        width: fit-content

    .places-left
        position: absolute
        font-size: 2em
        top: 50%
        left: 50%
        transform: translate(-50%, -50%);
</style>