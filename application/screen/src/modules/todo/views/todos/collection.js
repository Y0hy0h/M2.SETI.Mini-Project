var Marionette = require('backbone.marionette');

var TodoItemView = require('./item');
var tpl = require('./collection.hbs');
var Raphael = require('raphael');



// Item List View
// --------------
//
// Controls the rendering of the list of items, including the
// filtering of activs vs completed items for display.
module.exports = Marionette.CompositeView.extend({
    template: tpl,
    itemView: TodoItemView,
    itemViewContainer: '#todo-list',
    itemViewOptions: function(){
        return {paper: this.paper}
    },

    ui: {
        toggle: '#toggle-all'
    },

    events: {
        'click @ui.toggle': 'onToggleAllClick'
    },

    collectionEvents: {
        'sync': 'update'
    },

    initialize: function(options){
        this.paper = Raphael("holder", 1600, 680);
        // this.paper.clear()
    },
    // use onShow rather than onRender because DOM is not ready
    // and this.$el find or parent will return nothing
    onShow: function () {
        // this.update();
    },

    update: function () {
        // function reduceCompleted(left, right) {
        //     return left && right.get('completed');
        // }

        // var allCompleted = this.collection.reduce(reduceCompleted, true);

        // this.ui.toggle.prop('checked', allCompleted);
        // this.$el.parent().toggle(!!this.collection.length);
        // this.paper.clear()
    },

    onToggleAllClick: function (e) {
        var isChecked = e.currentTarget.checked;

        this.collection.each(function (todo) {
            todo.save({ 'completed': isChecked });
        });
    }

});
