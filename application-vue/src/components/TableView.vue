<template>
    <div>
        <p>Table</p>
        <p>{{ tableData.occupied }}/{{ tableData.capacity }}</p>
    </div>
</template>

<script lang="ts">
  import { Component, Prop, Vue } from 'vue-property-decorator'
  import { Table } from '@/model/table'

  @Component
  export default class TableView extends Vue {
    @Prop() private tableData!: Table
  };
</script>

<style scoped>

</style>