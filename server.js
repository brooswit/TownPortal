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
        run();
    });
});

async function delay(time = 0) {
    return new Promise((resolve, reject)=>{
        setTimeout(resolve, time);
    });
}

function oneOf(array) {
    return Array.isArray(array) ? array[Math.floor(Math.random() * array.length)] : array;
}

function grassController(previousStage, currentStage, nextStage) {
    return async (doc) => {
        const data = doc.data();

        const firstStage = "light grass";

        if(Math.random() < 0.20) {
            doc.update({
                classname: previousStage
            });
        } else {
            const offsets = [{x: 0, y: 1,},{x: 0,y: -1,},{x: 1,y: 0,},{x: -1,y: 0,},];
            const offset = oneOf(offsets);

            const snapshot = await entityCollection
                .where('x', '==', data.x+offset.x)
                .where('y', '==', data.y+offset.y)
                .get();

            if (snapshot.empty) {
                const entityData = {
                    classname: firstStage,
                    x: data.x+offset.x,
                    y: data.y+offset.y
                };
                const res = await entityCollection.add(entityData);

                console.log(res.id, entityData);

                return;
            }

            snapshot = await entityCollection
                .where('x', '==', data.x+offset.x)
                .where('y', '==', data.y+offset.y)
                .where('classname', '==', "dirt")
                .get();

            if (!snapshot.empty) {
                snapshot.forEach(doc => {
                    doc.update({
                        classname: firstStage
                    });
                });
                return;
            }

            snapshot = await entityCollection
                .where('x', '==', data.x+offset.x)
                .where('y', '==', data.y+offset.y)
                .where('classname', '==', currentStage)
                .get();

            if (!snapshot.empty) {
                snapshot.forEach(doc => {
                    const patch = {
                        classname: oneOf(nextStages)
                    };
                    doc.update(patch);
                    console.log(patch);
                });
                return;
            }
        }
    }
}

const controllers = {
    "light grass": grassController("dirt", "light grass", "grass"),
    "grass": grassController("light grass", "grass", "healthy grass"),
    "healthy grass": grassController("grass", "healthy grass", ["flower", "overgrowth"]),
    "flower": grassController("flower", "flower", "healthy grass"),
    "overgrowth": grassController("healthy grass", "overgrowth", ["healthy grass", "bush"]),
    "bush": grassController("bush", "healthy grass", "overgrowth"),
}

async function run() {
    let lastTick = -Infinity;
    while(true) {
        let currentTime = Date.now();
        let stepInterval = await ldClient.variation('step-interval', {}, 10);
        let paused = await ldClient.variation('pause', {}, true);
        if (!paused && currentTime > lastTick + stepInterval*1000) {
            const snapshot = await entityCollection.get();
            snapshot.forEach((doc) => {
                const data = doc.data();
                controllers[data.classname] && controllers[data.classname](doc);
                console.log(`thinkin bout ${data.classname}`)
            });
            lastTick = currentTime;
        } else {
            await delay();
        }
    }
}
