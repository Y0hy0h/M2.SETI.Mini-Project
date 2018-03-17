<template>
    <div class="table">
        <v-stage :config="configKonva">
            <v-layer>
                <v-circle :config="configCircle"></v-circle>
                <v-circle v-for="place in places" :config="getPlaceConfig(place)"></v-circle>
            </v-layer>
        </v-stage>
        <span class="left">{{tableData.occupied}}/{{tableData.capacity}}</span>
    </div>
</template>

<script lang="ts">
  import { Component, Prop, Vue } from 'vue-property-decorator'
  import { Table } from '@/model/table'

  @Component
  export default class TableView extends Vue {
    @Prop() private tableData!: Table

    get places (): number[] {
      const amount = this.tableData.capacity
      const places = new Array(amount)
      for (let i = 0; i < amount; i++) {
        places[i] = i
      }
      return places
    }

    private configKonva = {
      width: 300,
      height: 300,
    }

    private configCircle = {
      x: this.configKonva.width / 2,
      y: this.configKonva.height / 2,
      radius: this.configKonva.width / 2 * 0.5,
      fill: '#e9eeba',
    }

    getPlaceConfig (place: number): object {
      const occupied = place < this.tableData.occupied
      const radius = this.configKonva.width / 2 * 0.15
      const config = {
        x: this.configKonva.width / 2,
        y: this.configKonva.height / 2,
        radius: radius,
        fill: occupied ? '#e9eeba' : '#ff5555aa',
        offsetY: -this.configCircle.radius - radius - 10,
        rotation: (place / this.tableData.capacity) * 360,
      }
      return config
    }
  };
</script>

<style scoped lang="stylus">

    .table
        position: relative
        width: fit-content

    .left
        position: absolute
        font-size: 2em
        top: 50%
        left: 50%
        transform: translate(-50%, -50%);
</style>