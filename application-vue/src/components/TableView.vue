<template>
    <div class="table">
        <v-stage :config="configKonva">
            <v-layer>
                <v-circle :config="configCircle"></v-circle>
                <v-circle v-for="place in places" :key="place"
                          :config="getPlaceConfig(place)"></v-circle>
            </v-layer>
        </v-stage>
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

    private colorFree = Color('#e9eeba')
    private colorOccupied = Color('#bf4343')
    private colorSelected = Color('#919caa')

    /*private tableShape = {
      cx: this.$refs.canvas.width / 2,
      cy: this.$refs.canvas.height / 2,
      r: this.$refs.canvas.width * 0.5 / 2,
    }*/

    constructor () {
      super()
      this.randomForPlace = this.places.map(() => Math.random())
    }

    private configKonva = {
      width: 300,
      height: 300,
    }

    get configCircle () {
      let color = this.colorFree.mix(this.colorOccupied, this.tableData.occupied / this.tableData.capacity)
      if (0 < this.requestedPlaces && this.requestedPlaces <= this.tableData.free) {
        color = this.colorSelected
      }

      return {
        x: this.configKonva.width / 2,
        y: this.configKonva.height / 2,
        radius: this.configKonva.width / 2 * 0.5,
        fill: color.rgb().string()
      }
    }

    getPlaceConfig (place: number): object {
      const radius = this.configKonva.width / 2 * 0.15

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

      const config = {
        x: this.configKonva.width / 2,
        y: this.configKonva.height / 2,
        radius: radius,
        fill: color.rgb().string(),
        offsetY: this.configCircle.radius + radius + 10,
        rotation: (place / this.tableData.capacity) * 360 + 45 + Math.floor(this.randomForPlace[place] * 15)
      }
      return config
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