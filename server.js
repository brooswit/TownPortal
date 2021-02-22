let port = process.env.PORT || 3000;
let serviceAccountKey = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
let ldSDKKey = process.env.LD_SDK_KEY;

let express = require('express');
let http = require('http');
let IO = require('socket.io');
let admin = require('firebase-admin');
let LaunchDarkly = require('launchdarkly-node-server-sdk');

let app = express();
let httpServer = http.createServer(app);
let io = IO(httpServer);
let db = admin.initializeApp({credential: admin.credential.cert(serviceAccountKey)}).firestore();
let ldClient = LaunchDarkly.init(ldSDKKey);
ldClient.on('update', (param) => {
  console.log(`a flag was changed: ${JSON.stringify(param)}`);
});
let entityCollection = db.collection('entities');
const game = {
    find: async(patch) => {
        const results = [];
        let snapshots = entityCollection;
        for (key in patch) {
            snapshots = snapshots.where(key, '==', patch[key]);
        }
        snapshots = await snapshots.get();
        let promises = [];
        if (!snapshots.empty) {
            snapshots.forEach(async snapshot => {
                promises.push(makeEntity(snapshot.ref));
            });
        };
        return await Promise.all(promises);
    },
    findOne: async(patch) => {
        return (await game.find(patch))[0];
    },
    spawn: async(patch) => {
        const ref = await entityCollection.add(patch);
        return await makeEntity(ref);
    }
}

async function makeEntity(ref) {
    const snapshot = await ref.get();
    const data = snapshot.data();
    const self = {};
    const proto = {
        id: ref.id,
        update: async (patch) => {
            await ref.update(patch);
            Object.assign(self, patch, proto);
        },
        delete: async () => {
            await ref.delete();
        }
    }
    return Object.assign(self, data, proto);
}

app.use(express.static('dist'));

let states = {};

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

let controllers = {
    "land": async (self, game) => {
        const lands = await game.find({
            "classname": "land",
            "x": self.x,
            "y": self.y
        });

        for (land of lands) {
            if (land.id === self.id) continue;
            await self.update({
                height: self.height + land.height
            });
            await land.delete();
        }
    },
    "terra": async(self, game) => {
        console.log(`Terra is ${self.id}`);
        let land = null;
        
        if (!(land = await game.findOne({
            "classname": "land",
            "x": self.x,
            "y": self.y
        }))) {
            land = await game.spawn({
                "classname": "land",
                "x": self.x,
                "y": self.y,
                "height": 0
            });
        }

        await land.update({
            "height": land.height + Math.random()
        });

        const moveChance = 1/3;
        const shouldMove = Math.random() < moveChance;
        if (shouldMove) {
            const NORTH = 0;
            const EAST = 1;
            const SOUTH = 2;
            const WEST = 3;
            const DIRECTIONS = [NORTH, EAST, SOUTH, WEST];

            const moveDirection = oneOf(DIRECTIONS)
            if (moveDirection === NORTH) {
                self.update({
                    y: self.y+1
                });
            } else if (moveDirection === EAST) {
                self.update({
                    x: self.x+1
                });
            } else if (moveDirection === SOUTH) {
                self.update({
                    y: self.y-1
                });
            } else if (moveDirection === WEST) {
                self.update({
                    x: self.x-1
                });
            }
        }
    }
}

async function run() {
    console.log('starting TownPortal');
    let currentTime = Date.now();
    let stepInterval = await ldClient.variation('step-interval', {key:"anonymous"}, 10000);
    let lastTick = currentTime - stepInterval;
    let lastSkipMessageTime = lastTick;

    while(true) {
        currentTime = Date.now();
        stepInterval = await ldClient.variation('step-interval', {key:"anonymous"}, 10000);
        let isNotPaused = !(await ldClient.variation('pause', {key:"anonymous"}, true));
        let isTimeToStep = currentTime >= lastTick + stepInterval
        if (isTimeToStep && isNotPaused) {
            console.log(`stepping`)
            let snapshots = await entityCollection.get();
            console.log(`processing ${snapshots._size} entities`);
            snapshots.forEach(async (snapshot) => {
                let isPaused = await ldClient.variation('pause', {key:"anonymous"}, true);
                if (isPaused) return;
                let data = snapshot.data();
                const doesControllerExists = !!controllers[data.classname];
                if (doesControllerExists) {
                    const self = await makeEntity(snapshot.ref);
                    controllers[data.classname](self, game);
                } else {
                    await snapshot.ref.delete();
                }
            });
            lastTick += stepInterval;
        } else {
            if (currentTime >= lastSkipMessageTime + stepInterval) {
                lastSkipMessageTime = currentTime;
                console.log(`skipping due to ${JSON.stringify({isTimeToStep,isNotPaused})}`)
            }
            await delay();
        }
    }
}
