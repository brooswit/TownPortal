const LD_SDK_KEY = process.env.LD_SDK_KEY || 8080;
const SERVER_USER = {key:'server'};

const FLAG_KEY_STEP_INTERVAL = 'step-interval';
const FLAG_FALLBACK_STEP_INTERVAL = 10000;

const CONFIG_STATE = 'state';
const CONFIG_KEY_STEP_NUMBER = 'stepNumber';

const COLLECTION_ACTION_QUEUE = "actionQueue";

module.exports = exports = new (function(){
    this.start = start;
    this.stop  =  stop;
    this.spawn = spawn;
    this.step = step;

    this.started = false;
    this.paused = false;

    this.untilStarted = untilStarted;
    this.untilStopped = untilStopped;

    this._startPromise = new Resolvable();
    this._stopPromise = new Resolvable();

    const turnInterval = 10000
    asyncly(async ()=>{
        while(!started) {
            await delay(1);
        }
        this._ld = ldclient.init(LD_SDK_KEY);
        this._startPromise.resolve();
        while(started) {
            while(!paused) {
                await delay(1);
            }
            await this.step();
        }
        this._stopPromise.resolve()
    });
})();

async function step() {
    let stepInterval = this._ld.variation(FLAG_KEY_STEP_INTERVAL, USER_SERVER, FLAG_FALLBACK_STEP_INTERVAL);
    let stepDelay = delay(stepInterval);

    let stepNumber = await store.get(CONFIG_STATE, 0, CONFIG_KEY_STEP_NUMBER);

    let actionQueue = store.get(COLLECTION_ACTION_QUEUE, stepNumber, 'actions')
// loop
    for({entityId, action, options}) {
        await this._act(entityId, action, options)
    }

// wrap up
    await store.set(CONFIG_STATE, 0, CONFIG_KEY_STEP_NUMBER, stepNumber+1)
    await stepDelay;
}
async function act(entityId, action, options) {

}

async function spawn(socket) {
    await this._startPromise;
}

function start() {
    this.started = true;
    return this._startPromise;
}
function pause() {
    this.paused = true;
}
function unpause() {
    this.paused = false;
}
function stop() {
    this.started = false;
    return this._stopPromise;
}

function untilStarted() {
    return this._startPromise;
}
function untilStopped() {
    return this._stopPromise;
}
