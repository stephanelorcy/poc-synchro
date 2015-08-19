var PouchDB = require('pouchdb');
PouchDB.debug.enable('*');

var db = new PouchDB('http://localhost:5984/users');

var filter = {
  _id: '_design/custom',
  filters: {
    byUser: function (doc, req) {
      return doc._id === req.query.userId;
    }.toString()
  }
}

db.put(filter);
