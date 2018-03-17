<template>
    <div id="app">
        <Overview></Overview>
    </div>
</template>

<script lang="ts">
  import { Component, Vue } from 'vue-property-decorator'
  import Overview from '@/components/Overview.vue'

  @Component({
    components: {
      Overview,
    }
  })
  export default class App extends Vue {}
</script>

<style lang="stylus">
    @import url('https://fonts.googleapis.com/css?family=Kanit:200,400,400i,700i&subset=latin-ext');

    body
        margin: 0

    #app
        font-family: 'Kanit', Helvetica, Arial, sans-serif
        -webkit-font-smoothing: antialiased
        -moz-osx-font-smoothing: grayscale
        color: #2c3e50
</style>
