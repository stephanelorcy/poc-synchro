// Ionic Starter App

// angular.module is a global place for creating, registering and retrieving Angular modules
// 'starter' is the name of this angular module example (also set in a <body> attribute in index.html)
// the 2nd parameter is an array of 'requires'
angular.module('starter', ['ionic','synchro'])

.run(function($ionicPlatform, $log) {
  $ionicPlatform.ready(function() {
    // Hide the accessory bar by default (remove this to show the accessory bar above the keyboard
    // for form inputs)
    if(window.cordova && window.cordova.plugins.Keyboard) {
      cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
    }
    if(window.StatusBar) {
      StatusBar.styleDefault();
    }
  });
})

angular.module('synchro', [])

.factory('synchroConfiguration', function() {

  //var ROOT_DB = "http://192.168.1.90:5984";
  var ROOT_DB = "http://localhost:5984"
  return {
    userId : "bcelo",
    usersUrl : ROOT_DB+"/users",
    animauxUrl : ROOT_DB+"/animaux"
  }
})

.factory('syncNotifier', ['$log', '$rootScope', function($log,$rs) {
  var n = 0;

  return {
    synchronizingOn: function() {
      $log.log("Start synchronizing..." + n);
      n++;
      if(n == 1) {
        $log.log("Start synchronizing...");
        //$rs.$apply(function() {
          $rs.$broadcast('startSyncronizing');
        //});
      }
    },
    synchronizingOff: function() {
      $log.log("Stop synchronizing..." + n);
      if(n>0) {
        n--;
        if(n == 0) {
          $log.log("Stop synchronizing...");
          //$rs.$apply(function() {
            $rs.$broadcast('stopSyncronizing');
          //});
        }
      }
    }
  }
}])

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

.factory('synchroAnimaux', ["$log", "$q", 'synchroConfiguration', 'db','syncNotifier', function($log, $q, sc, db, sn) {
  // Service de synchronisation des animaux ...
  var animauxDB = db.get('animaux');
  var handler;
  var animauxByElevage = {};
  var animaux_q = $q.defer();

  var syncOn = function() {
    sn.synchronizingOn();
  }

  var syncOff = function() {
    sn.synchronizingOff();
  }

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

  var updateAnimaux = function(docs, elevages) {
      var objEl;
      if(elevages) {
        objEl = {};
        elevages.forEach(function(el) { if(el.date) objEl[el.id] = true});
      }
      $log.log("updateAnimaux "+JSON.stringify(objEl));
      docs.forEach(function(doc) {
        (!objEl||objEl[doc.idElevage])&&pushAnimal(doc.idElevage, {id:doc._id, race:doc.race, name:doc.name, deleted:doc._deleted});        
      });
      applyScope();
  }

  var removeAnimauxIn = function(idElevages) {
    var animauxToDelete = [];
    idElevages.forEach(function(idElevage) {
      $log.log("Suppression elevage : "+idElevage);
      if(animauxByElevage[idElevage]) {
         $log.log("Elevage a supprimer existe : "+idElevage);
        animauxToDelete=animauxToDelete.concat(animauxByElevage[idElevage].map(function(animal) {return animal.id}));
        delete animauxByElevage[idElevage];
      }
    });
    $log.log("animauxToDelete : "+JSON.stringify(animauxToDelete));
    return animauxDB.allDocs({keys:animauxToDelete}).then(function(docs) {
      $log.log("animauxToDelete : "+JSON.stringify(docs));
      // On devrait les supprimer de la base.
      // Mais ca pose ensuite des pb de synchro.
      // On se contente donc de les supprimer
      //if(docs.rows&&docs.rows.length>0) {
      //  return animauxDB.bulkDocs(docs.rows.map(function(doc) {
      //    return {_id:doc.id, _rev:doc.value.rev, _deleted:true};
      //  }));
      //}
    })
  }

  var startSyncAnimaux = function(idElevages) {
    var idEl = [];
    idElevages.forEach(function(id) {(id>=0)&&idEl.push(String(id))});
    $log.log("Starting sync animaux entities "+JSON.stringify(idEl));
      handler = animauxDB.replicate.from(sc.animauxUrl, {
        live:true,
        retry:true,
        filter: 'custom/byElevages',
        query_params: {elevagesIds: idEl.join(",")}
      })
      .on('change', function (change) {
        $log.log("change :"+JSON.stringify(change.docs));
        updateAnimaux(change.docs);
        applyScope();
      })
      .on('paused', function (info) {
        // replication was paused, usually because of a lost connection
        syncOff();
        $log.log("paused animaux:"+JSON.stringify(info));
      })
      .on('active', function (info) {
        syncOn();
        $log.log("active :"+JSON.stringify(info));
      })
      .on('error', function (err) {
        // totally unhandled error (shouldn't happen)
        syncOff();
        $log.log("error :"+JSON.stringify(err));
      });
  }

  var cleanAnimaux = function() {
    for(var k in animauxByElevage) {
      $log.log("Cleaning animals for elevage "+k);
      delete animauxByElevage[k];
    }
  }

  var loadAnimaux = function(elevages) {
    cleanAnimaux();
    // Load animals into memory
    animauxDB.allDocs({
      include_docs: true
    }).then(function (result) {
      $log.log(JSON.stringify(result));
      result.rows&&updateAnimaux(result.rows.map(function(row) { return row.doc }), elevages);
      return animaux_q.resolve(animauxByElevage);
    }).catch(function (err) {
      $log.log(err);
    });
  }

  return {

    stop: function() {
      stopSync();
    },

    changeSync: function(idElevages, idElevagesToDelete) {
      stopSync();
      //removeAnimauxIn(idElevagesToDelete).then(function() {startSyncAnimaux(idElevages)});
      startSyncAnimaux(idElevages);
    },

    reset: function(elevages) {
      stopSync();
      cleanAnimaux();
      db.remove('animaux');
      animauxDB.destroy().then(function (response) {
        animauxDB = db.get('animaux');
        startSyncAnimaux(elevages.map(function(el) { if(el.date) return el.id}));
      });
    },

    forceSync: function(animal) {

    },

    loadAnimaux:function(elevages) {
      return loadAnimaux(elevages);
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

.factory('synchroManager', ["$log", "$q", 'synchroConfiguration', 'db', 'synchroAnimaux', 'syncNotifier', function($log, $q, sc, db, sa, syncNotifier) {
  // This simple service control the synchronization for a specific user
  var userDb = db.get('user');
  var handler;

  var syncOn = function() {
    syncNotifier.synchronizingOn();
  }

  var syncOff = function() {
    syncNotifier.synchronizingOff();
  }

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

  var elevagesToDelete = function(oldElevages) {
    var etd = [];
    oldElevages.forEach(function(old) {
      var find = false;
      for(var i=0; i<elevages.length; i++) {
        if(elevages[i].id == old.id) {
          if(!(elevages[i].date) && old.date) {
            etd.push(old.id);
          }
          find = true;
          break;
        }
      }
      !find&&etd.push(old.id);
    });
    return etd;
  }

  var elevagesFromUserDoc = function(userDoc, syncAnimauxFlag) {
    var oldElevages = elevages.map(function(e) { return {id:e.id, date:e.date}});
    resetElevage();
    userDoc.tournees.forEach(function(t) {
      addElevage(t.id, t.date, t.name);
    });
    $log.log("OldElevages : "+JSON.stringify(oldElevages));
    syncAnimauxFlag&&sa.loadAnimaux(elevages);
    syncAnimauxFlag&&sa.changeSync(elevages.map(function(e) { if(e.date) return e.id }));
    //syncAnimauxFlag&&sa.changeSync(elevages.map(function(e) { if(e.date) return e.id }), elevagesToDelete(oldElevages));
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
    $log.log("UserDoc :"+JSON.stringify(userDoc));
    elevagesFromUserDoc(userDoc,false);
    $log.log("Elevages :"+JSON.stringify(elevages));
    elevages_q.resolve(elevages);
  }).catch(function(err) {
    $log.log("User doc empty : "+err);
    elevages_q.resolve(elevages);
  } ) ;

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
      $log.log("synchroManager starting global synchronization");
      sa.changeSync(elevages.map(function(e) { if(e.date) return e.id }), []);
      handler = userDb.replicate.from(sc.usersUrl, {
        live:true,
        retry:true,
        filter: 'custom/byUser',
        query_params: {userId: sc.userId}
      })
      .on('change', function (change) {
        $log.log("change :"+JSON.stringify(change.docs[0]));
        userDb.get(change.docs[0]._id, {conflicts: true}).then(function (doc) {
          $log.log(" >>> CONFLIT TEST <<<<< : "+JSON.stringify(doc));
          if(doc._rev!=change.docs[0]._rev) {
            $log.log("|||||||||||||||||||| Suppression rev obsolete ||||||||||||||| "+doc._rev);
            userDb.remove(doc._id, doc._rev);
          }
          }).catch(function (err) {
              // handle any errors
        });
        elevagesFromUserDoc(change.docs[0], true);
        applyScope();
      })
      .on('paused', function (info) {
        // replication was paused, usually because of a lost connection
        syncOff();
        $log.log("paused user:"+JSON.stringify(info));
      })
      .on('active', function (info) {
        // replication was resumed
        syncOn();
        $log.log("active :"+JSON.stringify(info));
      })
      .on('error', function (err) {
        // totally unhandled error (shouldn't happen)
        syncOff();
        $log.log("error :"+JSON.stringify(err));
      });
    },

    forceSync: function(elevage) {
      userDb.get(sc.userId).then(function(doc){
        $log.log("Recuperation des tournees pour l'ajout de l'elevage "+elevage.id+ " "+JSON.stringify(doc));
        for(var i=0; i<doc.tournees.length; i++) {
          var t = doc.tournees[i];
          if(t.id == elevage.id) {
            $log.log("Tournee pour l'elevage trouve...")
            t.date = true;
            return userDb.put(doc).then(function(result) {
              elevagesFromUserDoc(doc, true);
            });
          }
        }
      }); 
    },

    stop: function() {
      sa.stop();
      if(handler) {
        handler.cancel();
        handler = null;
      }
    }
  };
}])

.controller('elevagesCtrl', ['$log', '$scope', 'synchroManager', '$ionicModal','synchroAnimaux', '$timeout', '$ionicPopup', function($log, $scope, sm, im, sa, $to,$ionicPopup) {

  $scope.synchronizing = false;

  sm.listenElevages($scope)
  .then(function(elevages) {
    $scope.elevages = elevages;
    $scope.online = true;
    sa.loadAnimaux(elevages);
    return sa.listenAnimaux($scope);
  })
  .then(function(animauxByElevage) {
    $scope.animauxByElevage = animauxByElevage;
    // Ok, on peut démarrer la synchro
    sm.start();
  })

  // Dans le cas ou le scope disparait : on se désabonne ...

  $scope.$on("$destroy", function handler() {
    sm.unlistenElevages($scope);
    sa.unlistenAnimaux($scope);
  });

  var stoppingSync;

  // Etat de la synchronisation ...

  $scope.$on("startSyncronizing", function handler() {
    $log.log("Received message : startSyncronizing");
    if(stoppingSync) {
      $to.cancel(stoppingSync);
      stoppingSync=null;
    } 
    $scope.$apply(function() {$scope.synchronizing=true});
  });

  $scope.$on("stopSyncronizing", function handler() {
    $log.log("Received message : stopSyncronizing");
    if(stoppingSync) {
      $to.cancel(stoppingSync);
    }
    stoppingSync=$to(function() {$log.log("**");$scope.synchronizing=false; stoppingSync=null}, 2000);
  });

  $scope.log = function() {
    $log.log("Elevages :" + JSON.stringify($scope.elevages));
    $log.log("Synchronizing:" + $scope.synchronizing);
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
    $scope.synchronizing = false;
    $scope.online?sm.start():sm.stop();
  }

  // Reset
  $scope.reset = function() {
    var confirmPopup = $ionicPopup.confirm({
      title: 'Réinitialiser la base',
      template: 'Etes vous sûr de vouloir réinitialiser votre base ?',
      cancelText: 'Annuler'
    });
    confirmPopup.then(function(res) {
        res&&sa.reset($scope.elevages);
    });
  }

  // Forcer la synchronisation d'un elevage
  $scope.forceSync = function(elevage) {
    $scope.online = true;
    sm.forceSync(elevage);
    elevage.date=true;
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