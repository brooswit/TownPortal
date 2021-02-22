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

// function grassController(previousStage, currentStage, nextStages) {
//     return async (doc) => {
//         let data = doc.data();

//         let firstStage = "light grass";

//         if(Math.random() < 0.20) {
//             doc.update({
//                 classname: previousStage
//             });
//         } else {
//             let offsets = [{x: 0, y: 1,},{x: 0,y: -1,},{x: 1,y: 0,},{x: -1,y: 0,},];
//             let offset = oneOf(offsets);

//             let snapshot = await entityCollection
//                 .where('x', '==', data.x+offset.x)
//                 .where('y', '==', data.y+offset.y)
//                 .get();

//             if (snapshot.empty) {
//                 let entityData = {
//                     classname: firstStage,
//                     x: data.x+offset.x,
//                     y: data.y+offset.y
//                 };
//                 let res = await entityCollection.add(entityData);

//                 console.log(res.id, entityData);

//                 return;
//             }

//             snapshot = await entityCollection
//                 .where('x', '==', data.x+offset.x)
//                 .where('y', '==', data.y+offset.y)
//                 .where('classname', '==', "dirt")
//                 .get();

//             if (!snapshot.empty) {
//                 snapshot.forEach(doc => {
//                     doc.update({
//                         classname: firstStage
//                     });
//                 });
//                 return;
//             }

//             snapshot = await entityCollection
//                 .where('x', '==', data.x+offset.x)
//                 .where('y', '==', data.y+offset.y)
//                 .where('classname', '==', currentStage)
//                 .get();

//             if (!snapshot.empty) {
//                 snapshot.forEach(doc => {
//                     let patch = {
//                         classname: oneOf(nextStages)
//                     };
//                     doc.update(patch);
//                     console.log(patch);
//                 });
//                 return;
//             }
//         }
//     }
// }

// let controllers = {
//     "light grass": grassController("dirt", "light grass", "grass"),
//     "grass": grassController("light grass", "grass", "healthy grass"),
//     "healthy grass": grassController("grass", "healthy grass", ["flower", "overgrowth"]),
//     "flower": grassController("flower", "flower", "healthy grass"),
//     "overgrowth": grassController("healthy grass", "overgrowth", ["healthy grass", "bush"]),
//     "bush": grassController("bush", "healthy grass", "overgrowth"),
// }

// function grassController(previousStage, currentStage, nextStages) {

let controllers = {
    "terra": async(doc) => {
        const data = doc.data();
        const self = await makeEntity(data);
        const game = {
            find: async(patch) => {
                const results = [];
                let snapshot = entityCollection;
                for (key in patch) {
                    console.log (`where "${key}" === "${patch[key]}"`)
                    snapshot = snapshot.where(key, '==', patch[key]);
                }
                snapshot = snapshot.where('deleted', '!=', true);
                snapshot = await snapshot.get();
                let promises = [];
                if (!snapshot.empty) {
                    snapshot.forEach(async doc => {
                        promises.push(makeEntity(doc.data()));
                    });
                };
                return await Promise.all(promises);;
            },
            findOne: async(patch) => {
                return (await game.find(patch))[0];
            },
            spawn: async(patch) => {
                const doc = await entityCollection.add(patch);
                const snapshot = await doc.get();
                return await makeEntity(snapshot.data());
            }
        }

        async function makeEntity(data){
            console.log("making entity");
            console.log(data);
            return Object.assign({}, data, {
                update: async (patch) => {
                    console.log(doc);
                    console.log(Object.keys(doc));
                    doc.update(patch);
                }
            });
        }

        await think(self, game);

        async function think(self, game) {
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
            let querySnapshot = await entityCollection.get();
            console.log(`processing ${querySnapshot._size} entities`);
            querySnapshot.forEach(async (doc) => {
                let isPaused = await ldClient.variation('pause', {key:"anonymous"}, true);
                if (isPaused) return;
                let data = doc.data();
                const doesControllerExists = !!controllers[data.classname];
                if (doesControllerExists) {
                    console.log(`thinkin bout ${data.classname}`);
                    controllers[data.classname](doc);
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
