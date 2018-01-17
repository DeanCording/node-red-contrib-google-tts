# node-red-contrib-google-tts
A Node Red node to call the Google Text to Speech API

This node sends a string of text to Google's Text to Speech engine for it to be converted into speech audio. The result returned is a URL that can be used to download the speech audio file in MP3 format to be saved or played on a device or browser. The URL can be passed to the [node-red-contrib-google-cast](https://www.npmjs.com/package/node-red-contrib-google-cast) to be played of Google Home and Chromecast devices.

Google's TTS service has an input string length limit of 200 characters. If the text to be translated is greater than 200 characters, it will be intelligently broken into segments and the output will consist of an array of URLs linking to sequential audio files encoding each segment.

