# YT-FORGE

A desktop YouTube video downloader powered by yt-dlp and Electron.

---

## 🚀 Getting Started (For Developers)

### Prerequisites
- **Node.js** (v18 or newer recommended)
- **npm** (comes with Node.js)
- **Git**
- **yt-dlp** binary for your platform (see `bin/` folder)

### Clone the Repository
```sh
git clone https://github.com/Shaikh-Suja-Rahaman/YT-Forge.git
cd YT-Forge
```

### Install Dependencies
```sh
npm install
```

### Run the App in Development Mode
```sh
npm start
```
This will launch the Electron app with hot-reloading for the renderer.

### Build for Production
- **All platforms:**
  ```sh
  npm run dist
  ```
- **macOS only:**
  ```sh
  npm run dist:mac
  ```
- **Windows only:**
  ```sh
  npm run dist:win
  ```
- **Linux only:**
  ```sh
  npm run dist:linux
  ```

The output will be in the `dist-electron/` and `release/` folders (these are git-ignored).

---

## 📦 Download Pre-built Binaries
Pre-built binaries (e.g., `.dmg`, `.exe`, `.AppImage`) will be available on the [GitHub Releases](https://github.com/Shaikh-Suja-Rahaman/YT-Forge/releases) page soon.

---

## 🛠️ Contributing
- Please open issues or pull requests for bugs, features, or improvements.
- Make sure to follow the code style and test your changes.

---

## ⚠️ Note
- Large build artifacts and binaries are **not** tracked in git. Only source code is included in this repository.
- To test the app, clone the repo and follow the build instructions above.

---

## 📄 License
MIT
