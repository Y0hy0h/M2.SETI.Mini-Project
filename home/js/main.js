// var c=0;
// var t;
// var timer_is_on=0;

// function timedCount()
// {
// document.getElementById('txt').value=c;
// c=c+1;
// t=setTimeout("timedCount()",1000);
// }

// function doTimer()
// {
// if (!timer_is_on)
//   {
//   timer_is_on=1;
//   timedCount();
//   }
// }

// function stopCount()
// {
// clearTimeout(t);
// timer_is_on=0;
// document.getElementById('txt').value=c;
// }

// function resetCount()
// {
// c=0
// document.getElementById('txt').value=c;
// }


// var unique = require('uniq');

// var data = [1, 2, 2, 3, 4, 5, 5, 5, 6];

// console.log(unique(data));

// Creates canvas 320 × 200 at 10, 50
// var paper = Raphael(10, 50, 320, 200);

// // Creates circle at x = 50, y = 40, with radius 10
// var circle = paper.circle(50, 40, 10);
// // Sets the fill attribute of the circle to red (#f00)
// circle.attr("fill", "#f00");

// // Sets the stroke attribute of the circle to white
// circle.attr("stroke", "#fff");
window.onload = function () {
  var height = 480;
  var width  = 940;
  var r = Raphael("holder", width, height)
  var colors = [
    "#bf0000",
    "#bf5600",
    "#bfac00",
    "#7cbf00",
    "#26bf00",
  ]

  free_places = 4
  var color = colors[free_places]
  d = 100
  r.circle(130, 150, d).attr({stroke: color, fill: color, "fill-opacity": .75})
  r.circle(500, 350, d).attr({stroke: color, fill: color, "fill-opacity": .75})
  var lbl = r.text(130, 150, free_places)
  .attr({"font": '5em "Helvetica Neue", Arial', stroke: "none", fill: "#fff"})

  // s.push(r.path("M320,240c-50,100,50,110,0,190").attr({fill: "none", "stroke-width": 2}));
  // s.push(r.circle(320, 450, 20).attr({fill: "none", "stroke-width": 2}));
  // s.push(r.circle(320, 240, 5).attr({fill: "none", "stroke-width": 10}));
  // s.attr({stroke: Raphael.getColor()});
};
