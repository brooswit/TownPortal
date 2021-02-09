const SAMPLE_RATE = 5;

const io = require('socket.io-client');
const gameController = require('gamecontroller.js');
const pointerLockPlus = require('pointer-lock-plus').default;

let untilDomReady = new Promise((resolve)=>{document.addEventListener('DOMContentLoaded',()=>{resolve()});});
let socket = io();

let capture = false;
let keys = {};
let mouseButtons = {};

let mouseXBuffer = 0;
let mouseYBuffer = 0;

untilDomReady.then(()=>{
    var button = document.createElement("button");
    button.innerHTML = "Capture Inputs";
    var body = document.getElementsByTagName("body")[0];
    body.appendChild(button);

    button.addEventListener ("click", function() {
        pointerLockPlus({
            element: button,
            onAttain: ()=>{capture = true},
            onRelease: ()=>{capture = false},
            onData: (x, y)=>{
                mouseXBuffer+=x;
                mouseYBuffer+=y;
            },

            // onClose: ()=>{console.log("pointer close")},
            // onError: ()=>{console.log("pointer error")},
        });
    });

    window.addEventListener("mousedown", (e) => { mouseButtons[e.which] = true; }, false);
    window.addEventListener("mouseup", (e) => { mouseButtons[e.which] = false; }, false);

    window.addEventListener("keydown", (e) => { keys[e.key] = true; }, false);
    window.addEventListener("keyup", (e) => { keys[e.key] = false; }, false);

    sync();
    function sync() {
        let untilNextScheduledSample = new Promise((resolve, reject)=>{
            setTimeout(()=>{
                resolve()
            }, 1000 / SAMPLE_RATE);
        });

        let inputs = {};
        inputs.keys = {};
        inputs.controllers = {};
        inputs.mouse = {};

        if (capture) {
            inputs.keys = keys;

            inputs.mouse = {
                x: mouseXBuffer,
                y: mouseYBuffer,
                buttons: mouseButtons
            }

            // reset the mouse buffers
            mouseXBuffer = 0;
            mouseYBuffer = 0;

            if (gameController.gamepads) {
                for(let gamepad of gameController.gamepads) {
                    inputs.controllers[gamepad.id] = {};

                    inputs.controllers[gamepad.id].buttons = {};
                    for (let buttonId = 0; buttonId < gamepad.buttons; buttonId++) {
                        inputs.controllers[gamepad.id].buttons[buttonId] = gamepad.buttons[buttonId].pressed;
                    }

                    inputs.controllers[gamepad.id].axes = {};
                    if (gamepad.axes) {
                        const modifier = gamepad.axes.length % 2; // Firefox hack: detects one additional axe
                        for (let x = 0; x < this.axes * 2; x++) {
                        inputs.controllers[gamepad.id].axes[x] = gamepad.axes[x + modifier].toFixed(4);
                        }
                    }
                }
            }
        }

        // console.log(inputs);
        let untilEmitCompletes = new Promise((resolve, reject)=>{
            console.log(JSON.stringify(inputs));
            socket.emit('inputs', inputs, (res) => {
                resolve();
            });
        });

        Promise.all([
            untilNextScheduledSample,
            untilEmitCompletes
        ]).then(sync);
    }
});
