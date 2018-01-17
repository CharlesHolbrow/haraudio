const portAudio = require('naudiodon');
const _ = require('underscore');
const fs = require('fs');
const deinterleave = require('deinterleave');
const toWav = require('audiobuffer-to-wav');

// WebAudio processing happens in a separate thread. Using an AudioContext we
// can access and control the processing happening in an audio thread
const AudioContext = require('web-audio-api').AudioContext;
const context = new AudioContext;


//Create a new instance of Audio Input, which is a ReadableStream
var chanCount = 2;
var channels = _.range(chanCount); // [0, 1, 2, ...]
var sampleRate = 48000;
var toFloat = Math.pow(2, 15); // assumes Int 16 bit

var ai = new portAudio.AudioInput({
  channelCount: chanCount,
  sampleFormat: portAudio.SampleFormat16Bit,
  sampleRate: sampleRate,
  deviceId: 0
});

let globalFrameCount = null;
let fileSuffix = 0;

ai.on('error', console.error);
ai.on('data', (data) => {

  // Create an ArrayBuffer
  // see https://stackoverflow.com/questions/8609289/convert-a-binary-nodejs-buffer-to-javascript-arraybuffer/31394257#31394257
  const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const view = new Int16Array(ab); // Assumes Int16
  const frameCount = Math.floor(view.length / chanCount);

  // If there are 4 channels, data.length should be a multiple of 4
  if (frameCount !== view.length / chanCount) console.error('Error: weird data length');

  // [a,b,c, a,b,c, ...] → [a,a,a,..., b,b,b,..., c,c,c]
  const audio = deinterleave(view);

  // write a file for each channel
  // iterate over channels
  channels.forEach((chanNumber) => {
    // Create an audioBuffer. This is required, because the 'toWav' npm package
    // expects an audio buffer.
    const audioBuffer = context.createBuffer(1, frameCount, sampleRate);
    const audioData = audioBuffer.getChannelData(0);
    const start = chanNumber * frameCount;

    // Copy the the deinterleaved data to the audio buffer
    for (let i = 0; i < frameCount; i++) {
      audioData[i] = (audio[i + start]) / toFloat; // convert from uint 16 to floating point
    }

    // Write the audio buffer to disk
    const wav = toWav(audioBuffer);
    const chunk = new Uint8Array(wav);

    fs.writeFile(`./wavs/out${chanNumber}-${fileSuffix}.wav`, new Buffer(chunk), (err) => {
      if (err) console.error('Error when writing wav output', err);
    });
  });

  fileSuffix++;
});


//Create a write stream to write out to a raw audio file
var ws = fs.createWriteStream('rawAudio_final.raw');

//Start streaming
ai.pipe(ws);
ai.start();

process.once('SIGINT', ai.quit);
