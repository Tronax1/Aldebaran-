'use strict';

const Discord = require('discord.js');
const bot = new Discord.Client();
const ytDownload = require('ytdl-core');
const request = require('request');
const fs = require('fs');
const getYoutubeID = require('get-youtube-id');
const fetchVideoInfo = require('youtube-info');

var config = JSON.parse(fs.readFileSync('settings.json'));

const ytAPIkey = config.ytAPIkey;
const botController = config.botController;
const prefix = config.prefix;
const token = config.botToken;

var queue = [];
var isPlaying = false;
var dispatcher = null;
var skipReq = 0;
var voiceChannel = null;
var skippers = [];

bot.on('message', message =>{
  const member = message.member;
  const mess = message.content.toLowerCase();
  const args = message.content.split(' ').slice(1).join(" ");

  if(mess.startsWith(prefix + "q")){
    if(queue.length > 0 || isPlaying){
      getID(args, id =>{
        addToQueue(id);
        fetchVideoInfo(id, (err, videoInfo)=>{
          if(err) throw new Error(err);
          message.reply(" Added to queue: **" + videoInfo.title + "**");
        });
      });
    }
    else{
      isPlaying = true;
      getID(args, id=>{
        queue.push("placeholder");
        playMusic(id, message);
        fetchVideoInfo(id, (err, videoInfo)=>{
          if(err) throw new Error(err);
          message.reply(" Now playing: **" + videoInfo.title + "**");
        });
      });
    }
  }
  else if(mess.startsWith(prefix + "skip")){
    if(skippers.indexOf(message.author.id) === -1){
      skippers.push(message.author.id);
      skipReq++;
      if(skipReq >= (Math.ceil(voiceChannel.members.size) -1) / 2){
        skipSong(message);
        message.reply(" Skip has been accepted, skipping song!");
      }
      else{
        message.reply(" Skip has been accepted, you need **"
        + (Math.ceil(voiceChannel.members.size) -1) / 2 - skipReq + "** more skip votes.");
      }
    }
    else{
      message.reply("You already voted to skip");
    }
  }

});

bot.on('ready', () => {
  console.log('I am ready!');
});

function playMusic(id, message){
  voiceChannel = message.member.voiceChannel;

  voiceChannel.join().then(connection =>{
    var stream = ytDownload("https://www.youtube.com/watch?v=" + id, {
      filter: 'audioonly'
    });
    skipReq = 0;
    skippers = [];

    dispatcher = connection.playStream(stream);
    dispatcher.on('end', ()=>{
      skipReq = 0;
      skippers = [];
      queue.shift();
      if(queue.length === 0){
        queue = [];
        isPlaying = false;
      }
      else{
        playMusic(queue[0], message);
      }
      });
  });
}

function skipSong(message){
  dispatcher.end();
}

function isYoutube(str){
  return str.toLowerCase().indexOf("youtube.com") > -1;
}

function getID(str, cb){
  if(isYoutube(str)){
    cb(getYoutubeID(str));
  }
  else{
    searchVideo(str, id => {
      cb(id);
    });
  }
}

function addToQueue(strID){
  if(isYoutube(strID)){
    queue.push(getYoutubeID(strID));
  }
  else{
    queue.push(strID);
  }
}

function searchVideo(query, callback) {
    request("https://www.googleapis.com/youtube/v3/search?part=id&type=video&q="
    + encodeURIComponent(query) + "&key=" + ytAPIkey, (error, response, body)=> {
        var json = JSON.parse(body);
        if (!json.items[0]) callback("3_-a9nVZYjk");
        else {
            callback(json.items[0].id.videoId);
        }
    });
}

bot.login(token);
