// Ionic Starter App

// angular.module is a global place for creating, registering and retrieving Angular modules
// 'starter' is the name of this angular module example (also set in a <body> attribute in index.html)
// the 2nd parameter is an array of 'requires'
angular.module('starter', ['ionic','synchro'])

.run(function($ionicPlatform, $log, synchroManager) {
  $ionicPlatform.ready(function() {
    // Hide the accessory bar by default (remove this to show the accessory bar above the keyboard
    // for form inputs)
    if(window.cordova && window.cordova.plugins.Keyboard) {
      cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
    }
    if(window.StatusBar) {
      StatusBar.styleDefault();
    }

    synchroManager.start();

  });
})

angular.module('synchro', [])

.factory('synchroConfiguration', function() {
  return {
    userId : "slo",
    usersUrl : "http://localhost:5984/users"
  }
})

.factory('db', ["$log", function($log) {
  // Simple pouchdb accessor
  var dbs = {};
  var handlers = {};
  return {
    // Acces a database by its name
    get:function(name) {
      if(dbs[name]) {
        return dbs[name];
      } else {
        dbs[name] = new PouchDB(name);
        $log.log("new db creation : "+name);
        return dbs[name];
      }
    },
    // Remove the database from the service
    // if destroy, then destroy from the local storage too.
    remove:function(name, destroy) {
      if(dbs[name]) {
        destroy&&dbs[name].destroy().then(function() {
          $log.log(name+" local db has been destroyed");
        });
        delete dbs[name];
      }
    }
  }
}])

.factory('synchroManager', ["$log", "$q", 'synchroConfiguration', 'db', function($log, $q, sc, db) {
  // This simple service control the synchronization for a specific user
  var userDb = db.get('user');
  var handler;

  var elevages = [];
  var elevages_q = $q.defer();

  var addElevage = function(id, date, name) {
    elevages.push( {
      "id":id,
      "date":date,
      "name":name
    });
  }
  
  var addorUpdateElevage = function(id, date, name) {
    for(var i = 0; i<elevages.length; i++) {
      if(elevages[i].id==id) {
        elevages[i].date = date;
        elevages[i].name = name;
        return;
      }
    }
    addElevage(id,date,name);
  }

  var removeElevage = function(id) {
    for(var i = 0; i<elevages.length; i++) {
      if(elevages[i]==id) {
        elevages.splice(i,1);
      }
    }
  }

  var resetElevage = function() {
    elevages.splice(0,elevages.length);
  }

  var elevagesFromUserDoc = function(userDoc) {
    resetElevage();
    userDoc.tournees.forEach(function(t) {
      addElevage(t.id, t.date, t.name);
    });
  }

  var scopes = [];

  var addScope = function(scope) {
    scopes.push(scope);
  }

  var removeScope = function(scope) {
    for(var i = 0; i<scopes.length; i++) {
      if(scopes[i]===scope) {
        scopes.splice(i,1);
      }
    }
  }

  var applyScope = function() {
    scopes.forEach(function(scope) {
      $log.log("Applying scope");
      scope.$apply();
    });
  }

  //First initialization
  userDb.get(sc.userId).then(function(userDoc) {
    elevagesFromUserDoc(userDoc);
    $log.log("Elevages :"+JSON.stringify(elevages));
    elevages_q.resolve(elevages);
  });

  return {
    listenElevages: function(scope) {
      if(scope) {
        $log.log("Adding a new scope");
        addScope(scope);
      }
      return elevages_q.promise;
    },
    unlistenElevages: function(scope) {
      removeScope(scope);
    },
    start: function() {
      handler = userDb.replicate.from(sc.usersUrl, {
        live:true,
        retry:true,
        filter: 'custom/byUser',
        query_params: {userId: sc.userId}
      })
      .on('change', function (change) {
        $log.log("change :"+JSON.stringify(change.docs[0]));
        elevagesFromUserDoc(change.docs[0]);
        applyScope();
      })
      .on('paused', function (info) {
        // replication was paused, usually because of a lost connection
        $log.log("paused :"+JSON.stringify(info));
      })
      .on('active', function (info) {
        // replication was resumed
        $log.log("active :"+JSON.stringify(info));
      })
      .on('error', function (err) {
        // totally unhandled error (shouldn't happen)
        $log.log("error :"+JSON.stringify(err));
      });
    },
    stop: function() {
      if(handler) {
        handler.cancel();
      }
    }
  }
}])

.controller('elevagesCtrl', ['$log', '$scope', 'synchroManager', function($log, $scope, sm) {
  sm.listenElevages($scope).then(function(elevages) {
    $scope.elevages = elevages;
  });
  $scope.$on("$destroy", function handler() {
    sm.unlistenElevages($scope);
  });
  $scope.log = function() {
    $log.log(JSON.stringify($scope.elevages));
  }
}])