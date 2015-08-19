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

  var ROOT_DB = "http://localhost:5984";

  return {
    userId : "slo",
    usersUrl : ROOT_DB+"/users",
    animauxUrl : ROOT_DB+"/animaux"
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

.factory('synchroAnimaux', ["$log", "$q", 'synchroConfiguration', 'db', function($log, $q, sc, db) {
  // Service de synchronisation des animaux ...
  var animauxDB = db.get('animaux');
  var handler;
  var animauxByElevage = {};
  var animaux_q = $q.defer();

  function updateAnimal(animaux, animal) {
    for(var i = 0; i<animaux.length; i++) {
      if(animaux[i].id==animal.id) {
        if(animal.deleted) {
          animaux.splice(i,1);
        } else {
          animaux[i]=animal;
        }
        return;
      }
    }
    animaux.push(animal);
  }

  function pushAnimal(elevage, animal) {
    var animaux = animauxByElevage[elevage]?animauxByElevage[elevage]:[];
    updateAnimal(animaux, animal);
    animauxByElevage[elevage]=animaux;
  }

  var scopes = [];

  var addScope = function(scope) {
    $log.log("Adding a new scope for animaux entities ...");
    scopes.push(scope);
  }

  var removeScope = function(scope) {
    $log.log("Removing a scope for animaux entities ...");
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

  var stopSync = function() {
    if(handler) {
      $log.log("Stopping sync animaux entities")
      handler.cancel();
      handler=null;
    }
  }

  var updateAnimaux = function(docs) {
      $log.log("updateAnimaux");
      docs.forEach(function(doc) {
        pushAnimal(doc.idElevage, {id:doc._id, race:doc.race, name:doc.name, deleted:doc._deleted});        
      });
      applyScope();
  }

  //First initialization
  animauxDB.allDocs({
    include_docs: true
  }).then(function (result) {
    $log.log(JSON.stringify(result));
    result.rows&&updateAnimaux(result.rows.map(function(row) { return row.doc }));
    return animaux_q.resolve(animauxByElevage);
  }).catch(function (err) {
    $log.log(err);
  });

  return {
    changeSync: function(idElevages) {
      stopSync();
      $log.log("Starting sync animaux entities "+JSON.stringify(idElevages));
      handler = animauxDB.replicate.from(sc.animauxUrl, {
        live:true,
        retry:true,
        filter: 'custom/byElevages',
        query_params: {elevagesIds: idElevages}
      })
      .on('change', function (change) {
        $log.log("change :"+JSON.stringify(change.docs));
        updateAnimaux(change.docs);
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

    forceSync: function(animal) {

    },

    listenAnimaux: function(scope) {
      if(scope) {
        addScope(scope);
      }
      return animaux_q.promise;
    },

    unlistenAnimaux: function(scope) {
      removeScope(scope);
    }

  };
}])

.factory('synchroManager', ["$log", "$q", 'synchroConfiguration', 'db', 'synchroAnimaux', function($log, $q, sc, db, sa) {
  // This simple service control the synchronization for a specific user
  var userDb = db.get('user');
  var handler;

  var elevages = [];
  var elevages_q = $q.defer();

  var addElevage = function(id, date, name) {
    elevages.push( {
      "id":id,
      "date":date,
      "name":name,
      "local":date
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
    //var idElevages = elevages.map(function(e) { return e.id });
    //$log.log(JSON.stringify(idElevages));
    sa.changeSync(elevages.map(function(e) { return e.id }));
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
  };
}])

.controller('elevagesCtrl', ['$log', '$scope', 'synchroManager', '$ionicModal','synchroAnimaux', function($log, $scope, sm, im, sa) {

  // On s'abonne aux modifications des elevages suite à syncrho

  sm.listenElevages($scope).then(function(elevages) {
    $scope.elevages = elevages;
    $scope.online = true;
  });

  sa.listenAnimaux($scope).then(function(animauxByElevage) {
    $scope.animauxByElevage = animauxByElevage;
  });

  // Dans le cas ou le scope disparait : on se désabonne ...

  $scope.$on("$destroy", function handler() {
    sm.unlistenElevages($scope);
    sa.unlistenAnimaux($scope);
  });

  $scope.log = function() {
    $log.log("Elevages :" + JSON.stringify($scope.elevages));
  };

  // Voir l'elevage
  $scope.showElevage = function(elevage) {
    $scope.oldElevageName = elevage.name;
    $scope.elevage = elevage;
    $scope.elevageModal.show();
  }

  // Retour à la liste
  $scope.hideElevage = function() {
    $scope.elevageModal.hide();
  }

  // Annulation
  $scope.cancelElevage = function() {
    $scope.elevage.name = $scope.oldElevageName;
    $scope.hideElevage();
  }

  // Toggle synchro
  $scope.toggleSync = function() {
    $scope.online = !$scope.online;
  }

  // Gestion du detail : on utilise la fonction modale de ionic.

  // Create and load the Modal
  im.fromTemplateUrl('show-elevage.html', function(modal) {
    $scope.elevageModal = modal;
  }, {
    scope: $scope,
    animation: 'slide-in-up'
  });


}])