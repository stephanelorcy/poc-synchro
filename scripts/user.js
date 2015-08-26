var PouchDB = require('pouchdb');
//PouchDB.debug.enable('*');

var db = new PouchDB('http://localhost:5984/users');

var DEFAULT_NUMBER = 10;

var NUMBER_EL = 60;

var createUser = function(id, number) {

  var user = { _id:id, tournees:[] };
  number = number?number:DEFAULT_NUMBER;

  for(var i=0;i<number; i++) {
    user.tournees.push({id:i, date:(i%3 == 0), name:"Elevage "+i});
  }
  console.log(JSON.stringify(user));
  return user;
}

//createUser("bcelo",60);

db.put(createUser("bcelo",NUMBER_EL));
