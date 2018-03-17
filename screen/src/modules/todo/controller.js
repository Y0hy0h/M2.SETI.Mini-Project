var Marionette = require('backbone.marionette');

var Backbone = require('backbone');


var TodoLayout = require('./views/layout/layout');
var TodosCollection = require('./models/todos');

var periode = 1000


module.exports = Marionette.Controller.extend({

    onStart: function() {
        this.todosCollection = new TodosCollection();
        this.todosLayout = new TodoLayout({todosCollection: this.todosCollection});

        var onSuccess = function() {
            this.options.todoRegion.show(this.todosLayout);
        }.bind(this);
        this.todosCollection.fetch({success: onSuccess,
            complete: function(){
                setInterval(function() { Backbone.trigger('tick:30secs'); }, periode);
            }
        });
        console.log (this.todosCollection)
    },


    filterItems: function(filter) {
        // filter = (filter && filter.trim() || 'all');
        // this.todosLayout.updateFilter(filter);
    }

});
