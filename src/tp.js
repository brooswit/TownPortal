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

    const turnInterval = 10000
    asyncly(async ()=>{
        while(!started) {
            await delay(1);
        }
        this._ld = ldclient.init(LD_SDK_KEY);
        while(started) {
            while(!paused) {
                await delay(1);
            }
            await this.step();
        }
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

function spawn(socket) {

}

function start() {
    this.started = true;
}
function pause() {
    this.paused = true;
}
function unpause() {
    this.paused = false;
}
function stop() {
    this.started = false
}
