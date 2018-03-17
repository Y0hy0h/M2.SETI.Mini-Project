<template>
    <div class="table">
        <v-stage :config="configKonva">
            <v-layer>
                <v-circle :config="configCircle"></v-circle>
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

    private configKonva = {
      width: 100,
      height: 100,
    }

    private configCircle = {
      x: 50,
      y: 50,
      radius: 30,
      fill: '#e9eeba',
    }

    private configText = {
      x: 50,
      y: 50,
      text: `${this.tableData.occupied}/${this.tableData.capacity}`,
      align: 'center',
    }
  };
</script>

<style scoped lang="stylus">

    .table
        position: relative
        width: fit-content

    .left
        position: absolute
        top: 50%
        left: 50%
        transform: translate(-50%, -50%);
</style>