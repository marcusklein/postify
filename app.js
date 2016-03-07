/**
 * Created by mklein on 2/03/2016.
 */

var express       = require('express');
var bodyParser    = require('body-parser');
var request       = require('request');
var dotenv        = require('dotenv');
var SpotifyWebApi = require('spotify-web-api-node');
var https         = require('https');
var fs            = require('fs');

dotenv.load();

var spotifyApi = new SpotifyWebApi({
    clientId     : process.env.SPOTIFY_KEY,
    clientSecret : process.env.SPOTIFY_SECRET,
    redirectUri  : process.env.SPOTIFY_REDIRECT_URI
});

var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

app.get('/', function(req, res) {
    if (spotifyApi.getAccessToken()) {
        return res.send('You are logged in.');
    }
    return res.send('<a href="/authorise">Authorise</a>');
});

app.get('/authorise', function(req, res) {
    var scopes = ['playlist-modify-public', 'playlist-modify-private'];
    var state  = new Date().getTime();
    var authoriseURL = spotifyApi.createAuthorizeURL(scopes, state);
    console.log("authorising with callback" + authoriseURL);

    res.redirect(authoriseURL);
});

app.get('/callback', function(req, res) {
    spotifyApi.authorizationCodeGrant(req.query.code)
        .then(function(data) {
            spotifyApi.setAccessToken(data.body['access_token']);
            spotifyApi.setRefreshToken(data.body['refresh_token']);
            return res.redirect('/');
        }, function(err) {
            return res.send(err);
        });
});

app.use('/store', function(req, res, next) {

    console.error("called, nigga");
    if (req.body.token !== process.env.SLACK_TOKEN) {
        console.error("bitch please, check yo motha fuckin slack token");
        return res.status(500).send('Cross site request forgerizzle!');
    }
    next();
});


app.post('/store', function(req, res) {
    console.log("user is trying to store a track");
    spotifyApi.refreshAccessToken()
        .then(function(data) {
            spotifyApi.setAccessToken(data.body['access_token']);
            if (data.body['refresh_token']) {
                spotifyApi.setRefreshToken(data.body['refresh_token']);
            }
            if(req.body.text.indexOf(' - ') === -1) {
                var query = 'track:' + req.body.text;
            } else {
                var pieces = req.body.text.split(' - ');
                var query = 'artist:' + pieces[0].trim() + ' track:' + pieces[1].trim();
            }
            spotifyApi.searchTracks(query)
                .then(function(data) {
                    var results = data.body.tracks.items;
                    if (results.length === 0) {
                        return res.send('Could not find that track.');
                    }
                    var track = results[0];
                    spotifyApi.addTracksToPlaylist(process.env.SPOTIFY_USERNAME, process.env.SPOTIFY_PLAYLIST_ID, ['spotify:track:' + track.id])
                        .then(function(data) {
                            return res.send('Track added: *' + track.name + '* by *' + track.artists[0].name + '*');
                        }, function(err) {
                            return res.send(err.message);
                        });
                }, function(err) {
                    return res.send(err.message);
                });
        }, function(err) {
            return res.send('Could not refresh access token. You probably need to re-authorise yourself from the app\'s homepage.');
        });
});


var secureServer = https.createServer({
    key: fs.readFileSync('./ssl/server.key'),
    cert: fs.readFileSync('./ssl/server.crt'),
    ca: fs.readFileSync('./ssl/ca.crt'),
    requestCert: true,
    rejectUnauthorized: false
}, app).listen(process.env.PORT || 3000, function() {
    console.log("Secure Express server listening on port " + process.env.PORT || 5000);
});