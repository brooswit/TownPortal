const crypto = require('crypto');

class DataStoreRecord {
    constructor(dataStore, key) {
        this.dataStore = dataStore;
        this.key = key;
    }
    async exists() {
        return await this.dataStore.exists(this.key);
    }
    async set(value) {
        return await this.dataStore.set(this.key, value);
    }
    async get() {
        return await this.dataStore.get(this.key);
    }
    async upsert(patch) {
        return await this.dataStore.upsert(this.key, patch);
    }
    async delete() {
        return await this.dataStore.delete(this.key);
    }
}

class DataStore {
    constructor() {
        this.data = {};
    }

    rep(key) {
        return new DataStoreRecord(this, key);
    }

    async create(value) {}
    async exists(key) {}
    async set(key, value) {}
    async get(key) {}
    async upsert(key, patch) {}
    async delete(key) {}
}

class InMemoryDataStore extends DataStore {
    async create(value) {
        let id = null;
        do { id = rando(); } while(await this.exists(id));
        let payload = Object.assign({}, {id}, value);
        await this.set(id, payload);
        return id;
    }
    async keys() {
        return Object.keys(this.data);
    }
    async exists(key) {
        return this.data[key]!==undefined;
    }
    async set(key, value) {
        this.data[key] = value;
    }
    async get(key) {
        return this.data[key];
    }
    async upsert(key, patch) {
        for(let attribute in patch) {
            this.data[key] ||= {};
            this.data[key][attribute] = patch[attribute];
        }
    }
    async delete(key) {
        delete this.data[key];
    }
}

function rando(min, max) {
    let seed=null
    // console.log(seed);
    if(min===undefined) min=0;
    if(max===undefined) max=0xfffffffffffffff;
    if(seed===undefined || seed===null) {
        rando.sequence ||= 0;
        seed=rando.sequence;
        rando.sequence ++;
    }
    seed = seed.toString();
    let hash = crypto.createHash('sha1').update(seed).digest('hex');
    let factor = parseInt((hash).substring(0, 15), 16);
    let f = factor / 0xfffffffffffffff;
    // console.log(seed, f);
    return Math.round(min + ((max-min)*f));
}

class Thing {
    constructor(world, thingData, id) {
        this.id = id;
        this.data = thingData;
        this.world = world;
        this.removed = false;
    }

    async onSpawn(params) {
    }

    async onTick() {}
    async remove() {
        this.removed = true;
        await this.data.delete();
    }
}

class Something extends Thing {
    async onSpawn(params) {
        await super.onSpawn(params);
        const {type} = await this.data.get();
        console.log(`unknown thing: "${type}"`);
    }
}

class Entity extends Thing {
    async onSpawn(params) {
        await super.onSpawn(params);
        const x = params && params.x || 0;
        const y = params && params.y || 0;
        await this.data.upsert({x, y});
    }
}

class Character extends Entity {
    async onSpawn(params) {
        await super.onSpawn(params);
        await this.data.upsert({
            orderSequence: []
        });
    }
    
    async onTick() {
        await super.onTick();

        let view = await this.getView();
        await this.data.upsert({view});

        let {orderSequence} = await this.data.get();
        if(!orderSequence.length) return;

        let order = orderSequence.shift();
        let {x, y} = await this.data.get();
        switch(order){
            case 'north':
            case 'east':
            case 'south':
            case 'west':
                if(order === 'north') y--;
                if(order === 'east') x++;
                if(order === 'south') y++;
                if(order === 'west') x--;
                await this.data.upsert({x, y});
                break;
            case 'eat':
                let things = await this.world.getThingsAt(x,y);
                for(let thing of things) {
                    const {id, type} = await thing.data.get();
                    if (type === 'Apple') {
                        await thing.remove();
                    }
                }
                console.log('yum yum')
        }
        await this.data.upsert({orderSequence});
    }

    async getView(){
        let {x,y} = await this.data.get();
        let viewableThings = [];
        for(let scanX = -8; scanX<=8; scanX++) {
            for(let scanY = -8; scanY<=8; scanY++) {
                let things = await this.world.getThingsAt(x+scanX,y+scanY);
                for(let thing of things) {
                    const {id} = await thing.data.get();
                    viewableThings.push(id);
                }
            }
        }
        return viewableThings
    }
}

class Feral extends Character {
    async onTick() {
        await super.onTick();
        let {x, y, view, orderSequence} = await this.data.get();
        if(orderSequence.length > 0) return;
        let bestAppleId = null;
        let bestAppleScore = Infinity;
        let bestAppleOffsetX = 0;
        let bestAppleOffsetY = 0;
        for(let thingId of view) {
            let thing = await this.world.getThing(thingId);
            if(!thing) continue;
            let thingData = await thing.data.get();
            if(!thingData) continue;
            let {type, x: appleX, y: appleY} = thingData;
            let appleOffsetX = appleX - x;
            let appleOffsetY = appleY - y;
            if(type!=='Apple') continue;
            let score = Math.abs(appleOffsetX)+Math.abs(appleOffsetY);
            if(bestAppleId!==null && score<bestAppleScore) continue;
            bestAppleScore = score;
            bestAppleId = thingId;
            bestAppleOffsetX = appleOffsetX;
            bestAppleOffsetY = appleOffsetY;
        }
        if(bestAppleId){
            if(bestAppleScore===0) {
                console.log({x,y})
                orderSequence.push('eat')
            } else {
                if(Math.abs(bestAppleOffsetX)>Math.abs(bestAppleOffsetY)){
                    if(bestAppleOffsetX > 0) orderSequence.push('east');
                    if(bestAppleOffsetX < 0) orderSequence.push('west');
                } else {
                    if(bestAppleOffsetY > 0) orderSequence.push('south');
                    if(bestAppleOffsetY < 0) orderSequence.push('north');
                }
            }
        } else {
            // let r = rando(0,15);
            // if(r === 0) orderSequence.push('north');
            // else if(r === 1) orderSequence.push('east');
            // else if(r === 2) orderSequence.push('south');
            // else if(r === 3) orderSequence.push('west');
        }
        await this.data.upsert({orderSequence});
    }
}

class Plant extends Entity {
    constructor(world, thingData, id) {
        super(world, thingData, id);
        this.growthConstants = {};
        // intervalMin
        // intervalMax
        // limit
    }

    async onSpawn(params) {
        await super.onSpawn(params);
        let growths = {};
        for(let growthType in this.growthConstants) {
            growths[growthType] = {
                last: await this.world.getTick(),
                count: 0
            }
        }
        await this.data.upsert({ growths: growths });
    }

    async onTick() {
        await super.onTick();
        const now = await this.world.getTick();
        let d = await this.data.get()
        let {x,y, growths} = d;
        let shouldUpdate = false;
        for(let growthType in growths) {
            let {last, count} = growths[growthType];
            let {intervalMin, intervalMax, distance, limit} = this.growthConstants[growthType];

            const nextGrowth = last+rando(count, intervalMin, intervalMax);
            if(nextGrowth > now) continue;
            shouldUpdate = true;

            growths[growthType].last = last = now;
            growths[growthType].count = count = count + 1;
            // console.log('pow')
            // console.log(growths[growthType].count);
            let growthX = rando(x - distance, x + distance);
            let growthY = rando(y - distance, y + distance);
            if (growthType !== "None") {
                await this.world.spawnThing(growthType,{x: growthX, y: growthY});
            }

            if(!limit || count < limit) continue;
            await this.remove();
        }

        if(!shouldUpdate) return;
        await this.data.upsert({ growths });
    }
}

const minute = 10;
const hour = minute*10;
const day = hour*6;
const week = day*4;
const month = week*4;
const season = month*3;
const year = season*4;
const decade = year*10;
const century = decade * 10;

class Grass extends Plant {
    constructor(world, thingData, id) {
        super(world, thingData, id);
        this.growthConstants = {
            'None': {
                intervalMin: month,
                intervalMax: month,
                distance: 0,
                limit: 1
            }
        }
    }
}

class WorldTree extends Plant {
    constructor(world, thingData, id) {
        super(world, thingData, id);
        this.growthConstants = {
            'Apple': {
                intervalMin: week,
                intervalMax: week,
                distance: 16,
                limit: 0
            },
            'Feral': {
                intervalMin: year,
                intervalMax: century,
                distance: 16,
                limit: 0
            }
        }
    }
}

class Tree extends Plant {
    constructor(world, thingData, id) {
        super(world, thingData, id);
        this.growthConstants = {
            'Apple': {
                intervalMin: day,
                intervalMax: month,
                distance: 8,
                limit: 128
            }
        }
    }
}

class Apple extends Plant {
    constructor(world, thingData, id) {
        super(world, thingData, id);
        this.growthConstants = {
            'Tree': {
                intervalMin: day,
                intervalMax: day+day*(128*0.8),
                distance: 0,
                limit: 1
            },
            'Grass': {
                intervalMin: day,
                intervalMax: day+day,
                distance: 0,
                limit: 1
            }
        };
    }
    async onSpawn(params) {
        await super.onSpawn(params);
        const {x,y} = await this.data.get();
    }
}

class Game {
    constructor() {
        this.lastLog = Date.now();
        this.ticksBetweenLogs = 0
        this.ticks = 0;
        this.data = new InMemoryDataStore();
        this.ThingClasses = {};
        this.registerClass(Something);
    }

    async registerClass(ThingClass) {
        console.log(`registering ${ThingClass.name}`)
        this.ThingClasses[ThingClass.name] = ThingClass;
        return this;
    }
    async registerClasses(ThingClasses) {
        for (let ThingClass of ThingClasses) {
            this.registerClass(ThingClass);
        }
        return this;
    }

    async getThingsAt(queryX,queryY) {
        let things = [];
        for(let id of await this.data.keys()) {
            let thing = await this.getThing(id);
            let {x,y} = await thing.data.get();
            if(x===queryX && y===queryY) {
                things.push(thing);
            }
        }
        return things;
    }

    async getTick() {
        return this.ticks
    }

    async spawnThing(thingType, spawnParams) {
        // console.log(`spawn thing ${thingType}, ${JSON.stringify(spawnParams)}`);
        if(!thingType) return;
        if (typeof thingType !== 'string') {
            thingType = thingType.name;
            if (!thingType) return;
        }

        const thingId = await this.data.create({type: thingType});
        const thing = await this.getThing(thingId);
        await thing.onSpawn(spawnParams);
        return thing;
    }

    async getThing(thingId) {
        const rep = this.data.rep(thingId);
        if (!rep) return null;
        let d = await rep.get();
        if (!d) return null;
        // console.log({d, thingId})
        let {type} = d;
        if (!this.ThingClasses[type]) type = 'Something';
        const ThingClass = this.ThingClasses[type];
        return new ThingClass(this, rep, thingId);
    }

    async tick() {
        this.ticks++;
        this.ticksBetweenLogs++;
        let thingCount = {};
        for(let id of await this.data.keys()) {
            // thingCount++
            let thing = await this.getThing(id);
            if (!thing) continue;
            let thingData = await thing.data.get();
            if (!thingData) continue;
            let {type} = thingData;
            if(type === undefined || type === "undefined") {
                //todo fix this dirty hack
                await thing.remove();
                continue;
            }
            thingCount[type] = thingCount[type] || 0;
            thingCount[type] ++;
            await thing.onTick();
        }
        const now = Date.now()
        if(now > this.lastLog + 1000*10) {
            this.lastLog = now + 1000*10;
            console.log(this.ticks/year);
            console.log(this.ticksBetweenLogs);
            console.log(thingCount);
            this.ticksBetweenLogs=0;
        }
    }
}

const game = new Game();
game.registerClasses([Character, WorldTree, Feral, Tree, Apple, Grass]);

game.spawnThing('WorldTree');
game.spawnThing('Feral');

(async()=>{
    while(true) {
        await game.tick();
    }
})();

// import CONST from 'constants.js';

// class ThingControllerManager {
//     constructor(world) {
//         this.world = world;
//         this.thingControllers = {}
//     }

//     register(thingCategory, thingType, ThingControllerClass) {
//         this.definitions[thingCategory] ||= {};
//         this.definitions[thingCategory][thingType] ||= new ThingControllerClass(this);
//     }

//     async trigger(thingData, thingCategory, thingType, eventName, eventParams) {
//         if (await this.isInstanceRemoved(category, id)) return;
//         if (!await this.doesInstanceTypeExist(category, type)) return;
//         await this.definitions[category][type](this, id, event, params);
//     }
// }

// export class World {
//     constructor() {
//         this.classes = new ThingControllerManager(world);
//         this.things = new ThingDataManager(world);
//         this.hooks = new ThingHookManager(world);
//     }

// ////////////////////////////////////////////////////////////////////////////////
// // WORLD SETUP

//     registerClass(thingCategory, thingType, ThingClass) {
//         this.definitions[thingCategory]            ||= {};
//         this.definitions[thingCategory][thingType] ||= new ThingClass(this);
//     }

// ////////////////////////////////////////////////////////////////////////////////
// // INSTANCE MODEL ACCESSORS & TRANSFORMERS

// // GET
// async getThingData(category, id) {
//     if(!this.instances[category]) return;
//     return this.instances[category][id];
// }

// // CREATE
// async createThing(category, type) {
//     let id = await this.getCount(category);
//     let data = {id, type, removed: false};
//     await this.setThingData(category, id, data)
//     return id;
// }

// // SET
// async setThingData(category, id, newData) {
//     this.instances[category] ||= {};
//     this.instances[category][id] ||= newData;
// }

// // UPSERT
// async upsertThingData(category, id, newData) {
//     let data = await this.getThingData(category, id);
//     for (key in newData) {
//         data[key] = newData[key];
//     }
//     await this.setThingData(category, id, data);
// }

// // REMOVE
// async removeInstance(category, id) {
//     await this.upsertThingData(category, id, {removed: true});
// }

// ////////////////////////////////////////////////////////////////////////////////
// // INSTANCE MODEL ABSTRACTIONS

// // GET
//     async getThingDataType(category, id) {
//         if (!await this.doesInstanceExist(category, id)) return;
//         const data = await this.getThingData(category, id);
//         return data.type;
//     }

// // CHECK
//     async doesCategoryExist(category) {
//         return !!this.definitions[category];
//     }

//     async doesInstanceExist(category, id) {
//         return !!this.instances[category] && !!this.instances[category][id];
//     }

//     async doesTypeExist(category, type) {
//         return !!this.definitions[category] && !!this.definitions[category][type];
//     }

//     async doesInstanceTypeExist(category, type) {
//         const type = await this.getInstaceType(category, id);
//         if (!await this.doesTypeExist(category, type)) return;
//     }

//     async isInstanceRemoved(category, id) {
//         if (!await this.doesInstanceExist(category, id)) return;
//         const data = await this.getThingData(category, id);
//         return data.removed;
//     }

// ////////////////////////////////////////////////////////////////////////////////
// // WORLD TRANSFORMERS

//     async spawn(category, type, params) {
//         const id = await this.createThing(category, type)
//         await this.trigger(category, id, CONST.EVENT.SPAWN, params);
//     }

//     async trigger(category, id, event, params) {
//         if (await this.isInstanceRemoved(category, id)) return;
//         if (!await this.doesInstanceTypeExist(category, type)) return;
//         await this.definitions[category][type](this, id, event, params);
//     }


//     async tick() {
//         for(category in this.instances) {
//             for(id in this.instances[category]) {
//                 await this.trigger(category, id, CONST.EVENT.TICK, undefined);
//             }
//         }
//     }
// }
