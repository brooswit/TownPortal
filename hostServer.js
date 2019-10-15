const port = process.env.PORT || 8080;
const app = require('express')();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const tp = require('./src/tp')

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket){
  console.log('a user connected');
  tp.spawn(socket)
});

http.listen(port, async function(){
    console.log(`listening on *:${port}`);
    await tp.start();
});

async function exitHandler(options, exitCode) {
    if (options.cleanup) await tp.close();
    if (exitCode || exitCode === 0) console.log(exitCode);
    if (options.exit) process.exit();
}

//do something when app is closing
process.on('exit', exitHandler.bind(null,{cleanup:true}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {exit:true}));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR2', exitHandler.bind(null, {exit:true}));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {exit:true}));
