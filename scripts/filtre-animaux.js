var PouchDB = require('pouchdb');
PouchDB.debug.enable('*');

var db = new PouchDB('http://localhost:5984/animaux');

var filter = {
  _id: '_design/custom',
  filters: {
    byElevages: function (doc, req) {
    	var elevages = req.query.elevagesIds.split(",");
    	for(var i = 0; i<elevages.length; i++) {
    		if(doc.idElevage == elevages[i]) {
    			return true;
    		}
    	}
    	return false;
    }.toString()
  }
}

db.put(filter);
