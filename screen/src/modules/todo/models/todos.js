var Backbone = require('backbone');
Backbone.LocalStorage = require("backbone.localstorage");

var TableModel = require('./table');



module.exports = Backbone.Collection.extend({

    model: TableModel,

    // localStorage: new Backbone.LocalStorage('todos-backbone-marionette-browserify'),
    url: 'http://localhost/serveur/process.php',

    initialize: function () {
        this.listenTo( Backbone, 'tick:30secs', this.fetch, this );
    },
    getCompleted: function () {
        return this.filter(this._isCompleted);
    },

    fetchg: function () {
        // return this.reject(this._isCompleted);
        console.log('yeh(')
    },

    comparator: function (todo) {
        return todo.get('created');
    },



    _isCompleted: function (todo) {
        return todo.isCompleted();
    }

});