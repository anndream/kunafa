const express = require('express');
const router = express.Router();
const process = require('process');

const graph = require('fbgraph');
graph.setVersion("2.8");
graph.setAppSecret(process.env.FBSECRET);

const uuid = require('uuid');
const generatePassword = require('password-generator');

const nano = require('nano');
const Promise = require("bluebird");


const COUCHDB_USER = process.env.COUCHDB_USER;
const COUCHDB_PASSWORD = process.env.COUCHDB_PASSWORD;

const publicDb = nano(`http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@public-db:5984`).use("public");
const usersDb = nano(`http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@auth-db:5984`).use("_users");

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', {
    title: 'Babrika'
  });
});


function insertDoc(db, doc) {
  return new Promise((resolve, reject) => {
    db.insert(doc, function(err, result) {
      if (!err || err.error === 'conflict') {
        resolve(result);
      } else {
        return reject(err);
      }
    });
  });
}

function getUserInfo(accessToken) {
  return new Promise((resolve, reject) => {
    const profileRequestParams = {
      fields: 'picture,name,first_name,birthday,education,hometown,email,is_verified,languages,last_name,locale,location,middle_name,name_format,political,quotes,relationship_status,religion,sports,about,gender,id,timezone,link,age_range',
      access_token: accessToken
    }
    graph.get("/me", profileRequestParams, (error, result) => {
      if (error) {
        return reject(error);
      } else {
        return resolve(result);
      }
    });
  }).then(user => {
    return Promise.all([getUserPicture('normal', accessToken), getUserPicture('large', accessToken)]).then(pics => {
      user.image = {
        uri: pics[1].data.url,
        resized: [{
            size: 50,
            uri: user.picture.data.url
          }, {
            size: 100,
            uri: pics[0].data.url
          }, {
            size: 200,
            uri: pics[1].data.url
          }

        ]
      }
      return user;
    });
  });
}

function getUserPicture(type, accessToken) {
  return new Promise((resolve, reject) => {
    const profileRequestParams = {
      type: type,
      redirect: 'false',
      access_token: accessToken
    }
    graph.get('/me/picture', profileRequestParams, (error, result) => {
      if (error) {
        return reject(error);
      } else {
        return resolve(result);
      }
    });
  });
}

router.post('/facebook', function(req, res, next) {

  const accessToken = req.body.accessToken;

  getUserInfo(accessToken).then(result => {
    const name = 'fbuser' + result.id + "_" + uuid.v4();

    const password = generatePassword(20, false);

    const profile = result;
    profile._id = "profile_" + 'fbuser' + result.id;
    profile.fbId = profile.id;
    profile.id = undefined;
    profile.type = "profile";

    const user = {
      _id: "org.couchdb.user:" + name,
      name,
      roles: [],
      type: "user",
      password,
      profileId: profile._id
    };

    return Promise.all([insertDoc(publicDb, profile), insertDoc(usersDb, user)]).then(result => {
      return {
        name,
        password,
        profileId: profile._id
      }
    });
  }).then(response => {
    res.json(response);
  }).catch(err => {
    console.log(err);
    res.json({
      err
    })
  });
});

module.exports = router;