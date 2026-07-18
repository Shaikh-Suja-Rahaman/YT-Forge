const { spawn } = require('child_process');
const ytDlpPath = "/Users/suja/Suja's Folder/YoutubeVideoDownloader/YT-FORGE/bin/yt-dlp_macos";
const ffmpegPath = "/Users/suja/Suja's Folder/YoutubeVideoDownloader/YT-FORGE/node_modules/ffmpeg-static/ffmpeg";

const args = [
  "-v",
  "https://youtu.be/fVPCbCH_c1c?si=0137WlQ8YyNo-Qog",
  "--format", "313+140",
  "--output", "test_trim.mp4",
  "--ffmpeg-location", ffmpegPath,
  "--download-sections", "*215-418",
  "--downloader-args", "ffmpeg:-c copy",
  "--merge-output-format", "mp4"
];

console.log("Running:", ytDlpPath, args.join(" "));
const p = spawn(ytDlpPath, args);

p.stdout.on('data', d => process.stdout.write(d.toString()));
p.stderr.on('data', d => process.stderr.write(d.toString()));
p.on('close', c => console.log('Exited with', c));
