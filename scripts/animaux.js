var PouchDB = require('pouchdb');
PouchDB.debug.enable('*');

var db = new PouchDB('http://localhost:5984/animaux');

var RACE = ["vache", "vachette", "bourguignone", "berichonne", "normande"];
var MIN = 50;
var MAX_PARAM = 10;

var NUMBER_EL = 60;

var createAnimal = function(idElevage, i) {
  return {
    _id:idElevage+"_"+i,
    idElevage:String(idElevage),
    name:"Animal "+idElevage+"_"+i,
    race:RACE[idElevage%RACE.length]
  }
}

var createElevage = function(id) {
  var number = MIN + (id%MAX_PARAM)*MAX_PARAM;
  var animaux = [];
  for(var i=0; i<number; i++) {
    animaux.push(createAnimal(id, i));
  }
  return animaux;
}

//console.log(JSON.stringify(createElevage(1)));

function create(idElevage) {
  if(idElevage==NUMBER_EL) {
    return;
  }
  db.bulkDocs(createElevage(idElevage)).then(create(idElevage+1));
}

create(0);

//db.put(filter);
