var Backbone = require('backbone');



module.exports = Backbone.Model.extend({

    defaults: {
        radio: 100
    },

    initialize: function () {
        // if (this.isNew()) {
        //     this.set('created', Date.now());
        // }
    },

    getColor: function () {
        var colors = [
            "#bf0000",
            "#bf5600",
            "#bfac00",
            "#7cbf00",
            "#26bf00",
          ]

          free_places = this.get('free_places')
          return colors[free_places]
    },

    // toggle: function () {
    //     return this.set('completed', !this.isCompleted());
    // },

    // isCompleted: function () {
    //     return this.get('completed');
    // }

});