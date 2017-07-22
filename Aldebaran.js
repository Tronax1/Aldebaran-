'use strict';

const Discord = require('discord.js');
const bot = new Discord.Client();
const ytDownload = require('ytdl-core');
const request = require('request');
const fs = require('fs');
const getYoutubeID = require('get-youtube-id');
const fetchVideoInfo = require('youtube-info');
const osu = require('node-osu');
const Dictionary = require('oxford-dictionary-api');

var config = JSON.parse(fs.readFileSync('settings.json'));

const ytAPIkey = config.ytAPIkey;
const botController = config.botController;
const prefix = config.prefix;
const token = config.botToken;
const osuAPIkey = config.osuAPIkey;
const oxfordID = config.oxfordID;
const oxfordAPIkey = config.oxfordAPIkey;
const usernameID = config.usernameID;

var osuApi = new osu.Api(osuAPIkey, {
    notFoundAsError: true,
    completeScores: false
})

var dict = new Dictionary(oxfordID, oxfordAPIkey);

var queue = [];
var queueList = [];
var isPlaying = false;
var dispatcher = null;
var skipReq = 0;
var voiceChannel = null;
var skippers = [];
var volume = 0;
var defaultVolume = 20/100;

bot.on('message', message =>{
  const member = message.member;
  const mess = message.content.toLowerCase();
  const args = message.content.split(' ').slice(1).join(" ");

  //Command to queue songs
  if(mess.startsWith(prefix + "play")){
     if(member.voiceChannel){
        if(queue.length > 0 || isPlaying){
          getID(args, id =>{
            addToQueue(id);
            fetchVideoInfo(id, (err, videoInfo)=>{
              if(err) throw new Error(err);
                message.reply(" Added to queue: **" + videoInfo.title + "**");
                queueList.push(videoInfo.title);
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
                message.reply(" Added to queue: **" + videoInfo.title + "**");
                queueList.push(videoInfo.title);
            });
          });
        }
      }
      else{
        message.reply('You must be in a voice channel!');
      }
  }

  //Command to skip songs
  else if(mess.startsWith(prefix + "skip")){
    if(skippers.indexOf(message.author.id) === -1){
      skippers.push(message.author.id);
      skipReq++;
      if(skipReq >= Math.ceil(voiceChannel.members.size - 1)  / 2 || message.author.id === usernameID){ //-1 because the bot shouldn't be included in the votes
        skipSong(message);
        message.reply(" Skip has been accepted, skipping song!");
      }
      else{
        message.reply(" Skip has been accepted, you need **"
        + ((Math.ceil((voiceChannel.members.size - 1) / 2)) - skipReq) + "** more skip votes.");
      }
    }
    else{
      message.reply("You already voted to skip");
    }
  }

  //Pauses music
  else if(mess.startsWith(prefix + "pause")){
    pauseMusic(message);
  }

  //Resumes music
  else if(mess.startsWith(prefix + "resume")){
    resumeMusic(message);
  }

  //Changes the volume of the song
  else if(mess.startsWith(prefix + "vol")){
      if(Number.isNaN(Number.parseInt(args, 10))){
          message.reply("That is not a valid number!");
      }
      else{
        if(args < 0 || args > 100){
         message.reply("Please enter a value from 0 to 100!");
         }
        else{
         volume = args/100; //The parameter takes values from 0 to 1, makes it easier for the user
         changeVolume(volume);
         message.reply("Volume set to: " + (volume*100) + "%");
       }
      }
  }

  //Kicks the bot from the voice channel
  else if(mess.startsWith(prefix + "leave")){
      queue = [];
      queueList = [];
      dispatcher.end();
      bot.user.setPresence({ status: 'online', game: { name: "Type !commands for commands" } });
      voiceChannel.leave();
    }

    //Shows the queue list
  else if(mess.startsWith(prefix + "list")){
    var format = "```";
    for(var i = 0; i < queueList.length; i++){
      var temp = (i + 1) + ". " + queueList[i] + (i === 0 ? "  (Current Song)" : "") + "\n";
      if((format + temp).length <= 2000 - 3){ //-3 because there are three ticks ```
        format += temp;
      }
      else{
        format += "```";
        message.channel.send(format);
        format = "```";
      }
    }
    format += "```";
    message.channel.send(format);
  }

  //Displays osu stats of the user
  else if(mess.startsWith(prefix + "osu")){
      osuApi.getUser({u: args}).then(user => {
      message.channel.send("\n```Name: " + user.name + "\n" + "Country: "
      + user.country + "\n" + "Level: " + user.level + "\n" + "Accuracy: " + user.accuracyFormatted + "\n" + "SS: " + user.counts.SS + "\n"
      + "S: " + user.counts.S + "\n" + "A: "
      + user.counts.A
      + "\n" + "Plays: " + user.counts.plays
      + "\nPP: " + user.pp.raw + "\n" + "Rank: " + user.pp.rank + "\n" + "Country Rank: " + user.pp.countryRank + "```");
    }).catch(error =>{
        message.channel.send("User doesn't exist");
      });
    }

    //Looks for the definition of a word
    else if(mess.startsWith(prefix + "define")){
        var word = args.replace(/\s+/g, '');
        dict.find(word, (error,data) =>{
          if(error) return message.channel.send("That word is not in my dictionary D:");
          message.channel.send("```Definition:\n\n"
          + "1. "+ data.results[0].lexicalEntries[0].entries[0].senses[0].definitions[0] + "\n\n"
          + "Pronunciation: ```");
        message.channel.send("", {
            files:[
              data.results[0].lexicalEntries[0].pronunciations[0].audioFile
            ]
          });
        });
      }

  //PM's all of the bot's commands
  else if(mess.startsWith(prefix + "commands")){
    message.author.send("```\nList of commands\n\n!play => queues music\n!skip => skips song\n!vol => changes volume\n"
    + "!pause => pauses music\n!resume => resumes music\n!list => shows the queue\n!osu => shows osu stats of the user\n!define => defines a word thats in english```");
    }

});

bot.on('ready', () => {
  console.log('I am ready!');
  bot.user.setPresence({ status: 'online', game: { name: "Type !commands for commands" } });
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
    fetchVideoInfo(id, (err, videoInfo)=>{
      if(err) throw new Error(err);
        bot.user.setPresence({ status: 'online', game: { name: videoInfo.title } });
    });

    dispatcher.setVolume(defaultVolume); //Defaults to 20%, personal preference to avoid ear damage
    dispatcher.on('end', ()=>{
      skipReq = 0;
      skippers = [];
      queue.shift();
      queueList.shift();
      if(queue.length === 0){
        queue = [];
        queueList = [];
        isPlaying = false;
      }
      else{
        setTimeout( ()=> {
            playMusic(queue[0], message);
        }, 500);

      }
      });
  });
}

function skipSong(message){
  dispatcher.end();
}

function pauseMusic(message){
  dispatcher.pause();
}

function resumeMusic(message){
  dispatcher.resume();
}

function changeVolume(message){
  dispatcher.setVolume(message);
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
