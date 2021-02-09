const port = process.env.PORT || 3000;
const serviceAccountKey = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
const ldSDKKey = process.env.LD_SDK_KEY;

const express = require('express');
const http = require('http');
const IO = require('socket.io');
const admin = require('firebase-admin');
const LaunchDarkly = require('launchdarkly-node-server-sdk');

const app = express();
const httpServer = http.createServer(app);
const io = IO(httpServer);
const db = admin.initializeApp({credential: admin.credential.cert(serviceAccountKey)}).firestore();
const ldClient = LaunchDarkly.init(ldSDKKey);

const entityCollection = db.collection('entities');

app.use(express.static('dist'));

io.on('connection', (socket) => {
    states[socket.id] = {};
    let prefix = `[user@${socket.id}]`;
    console.log(`${prefix} Connected`);

    // socket.on('inputs', (inputs, callback) => {
    //     console.log(`${prefix} Inputs`);
    //     states[socket.id] = inputs;
    //     combineStates();
    //     averageStates();
    //     callback({inputs: averageState});
    // });

    socket.on('disconnect', () => {
        delete states[socket.id];
        console.log(`${prefix} Disconnected`);
    });
});

Promise.all([
    ldClient.waitForInitialization()
]).then(()=>{
    httpServer.listen(port, () => {
        console.log(`listening on *:${port}`);
    });
});
