var Marionette = require('backbone.marionette');

// var Raphael = require('raphael');


var tpl = require('./item.hbs');
var count = 1;
// Todo List Item View
// -------------------
//
// Display an individual todo item, and respond to changes
// that are made to the item, including marking completed.
module.exports = Marionette.ItemView.extend({
    // tagName: 'li',
    template: tpl,

    ui: {
        edit: '.edit'
    },

    // events: {
    //     'click .destroy':       'destroy',
    //     'click .toggle':        'toggle',
    //     'dblclick label':       'onEditClick',
    //     'keydown  @ui.edit':    'onEditKeypress',
    //     'focusout @ui.edit':    'onEditFocusout'
    // },

    modelEvents: {
        'change': 'render'
    },
    initialize: function(options){
        this.paper = options.paper
    },
    erase: function () {
        // console.log('destruido');
    },
    onBeforeDestroy: function() {
    // custom destroying and non-DOM related cleanup goes here
  },
    onRender: function () {
        // this.$el.removeClass('active completed');

        // if (this.model.get('completed')) {
        //     this.$el.addClass('completed');
        // } else {
        //     this.$el.addClass('active');
        // }
        model = this.model
        // var paper = Raphael("todo-list", 480, 940);
        paper = this.paper

        if(this.circle && this.lbl){
            this.circle.remove()
            this.lbl.remove()
        }
        x = model.get("position_x")
        // console.log(count)
        // x = (count*550)
        // if (count <= 1) count++
        y = parseInt(model.get("position_y"))

        color = model.getColor()
        this.circle = paper.circle(x, y, model.get("radio"))
        .attr({stroke: color, fill: color, "fill-opacity": .75})
        this.lbl = paper.text(x, y, model.get("free_places"))
        .attr({"font": '5em "Helvetica Neue", Arial', stroke: "none", fill: "#fff"})
    },
    destroy: function () {
        this.model.destroy();
    },

    toggle: function () {
        this.model.toggle().save();
    },

    onEditClick: function () {
        this.$el.addClass('editing');
        this.ui.edit.focus();
        this.ui.edit.val(this.ui.edit.val());
    },

    onEditFocusout: function () {
        var todoText = this.ui.edit.val().trim();
        if (todoText) {
            this.model.set('title', todoText).save();
            this.$el.removeClass('editing');
        } else {
            this.destroy();
        }
    },

    onEditKeypress: function (e) {
        var ENTER_KEY = 13, ESC_KEY = 27;

        if (e.which === ENTER_KEY) {
            this.onEditFocusout();
            return;
        }

        if (e.which === ESC_KEY) {
            this.ui.edit.val(this.model.get('title'));
            this.$el.removeClass('editing');
        }
    }
});

