module.exports = {
  packagerConfig: {
    asar: true,
    // Extract native binaries from asar so they remain executable
    asarUnpack: [
      '**/node_modules/ffmpeg-static/**',
      '**/node_modules/ffprobe-static/**',
    ],
    // Ship the bin/ folder alongside the asar (accessible via process.resourcesPath)
    extraResource: ['./bin'],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'YT-FORGE',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          name: 'yt-forge',
          categories: ['AudioVideo'],
          description: 'A desktop YouTube video downloader powered by yt-dlp',
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          name: 'yt-forge',
          categories: ['AudioVideo'],
          description: 'A desktop YouTube video downloader powered by yt-dlp',
        },
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        build: [
          {
            entry: 'src/main.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/preload.js',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
        ],
      },
    },
  ],
};
