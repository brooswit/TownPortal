module.exports = exports = new (function(){
    this.start = start;
    this.stop  =  stop;
    this.spawn = spawn;
    this.step = step;

    this.started = false;
    this.stopped = false;

    const turnInterval = 10000
    asyncly(async ()=>{
        while(!started) {
            await delay(1);
        }
        while(!stopped) {
            this.step();
            await delay(10000);
        }
    });
})();

async function start() {

}
async function stop() {

}
async function stop() {

}
async function spawn(socket) {

}
