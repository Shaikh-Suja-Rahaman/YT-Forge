# Video Trimmer Feature: Robust Implementation Plan (v2)

This plan outlines the architecture for the YT-FORGE visual trimmer, focusing entirely on a rock-solid, secure, and accurate YouTube-only experience for v1.

## 1. Architecture: The Layered YouTube Player

We will use a layered fallback approach for video playback.

### Layer 1: YouTube Privacy Iframe (Primary)
- **Use Case:** Standard, non-age-restricted YouTube videos.
- **Benefit:** Instant loading, automatic quality switching, handles DASH audio/video natively.

### Layer 2: Direct Stream Proxy (Age-Restricted & Failsafe)
- **Use Case:** Age-restricted videos (using yt-dlp cookies) or if the Iframe API is blocked.
- **Mechanism:** We execute `yt-dlp -g` in the background to get the raw stream URL and pipe it to a native `<video>` tag.
- **Critical Fixes for v1:**
  1. **Format Negotiation (Silent Audio Bug):** By default, `yt-dlp` fetches separate DASH audio and video streams. We must force it to return a pre-muxed format compatible with HTML5 players using `-f "best[ext=mp4]/best"`, or specifically pass the separate streams to the proxy if we implement a custom MSE muxer (but forcing pre-muxed `mp4` or an `m3u8` playlist is much safer for v1).
  2. **HLS Playback:** Chromium (Electron) does not natively support `.m3u8` HLS playlists. We will install and integrate `hls.js` into the React player component so it can parse and play the HLS streams seamlessly.
  3. **Stream Expiry & Refresh:** YouTube direct URLs expire (often within hours) and are IP-locked. The player will listen for `403 Forbidden` errors or stream stalls on the `<video>` element. If detected, it will automatically trigger a background refresh (`yt-dlp -g`), inject the new URL into `hls.js` or the `<video>` src, and seek to the previous `currentTime`.
  4. **SSRF Hardening:** The `ytforge://stream?url=...` custom protocol is an SSRF vector. The Main Process handler will enforce a strict allowlist regex, ensuring it *only* proxies URLs matching `*.googlevideo.com`, `*.youtube.com`, or other explicitly trusted CDNs.

## 2. The Trimmer UI & UX

The trimmer will expand **inline** within the `DetailsView` to maintain spatial context with the video information.

### Time Parsing & Data Integrity
Users will input wild formats (`1:5:3`, `90:00`, `72`). We will implement a robust `parseTimeInput` utility that normalizes any string into total seconds, sanitizes the input, and clamps it to the video's total duration. If the input is entirely invalid, it gracefully reverts to the previous valid state.

### The "Fast vs Precise" Cut Logic
- **Honest Copy:** The "Fast Cut" toggle will accurately state: *"Fast Download (May start 5-15 seconds early due to keyframes)"*.
- **Auto-Precision:** If the user selects a segment **under 60 seconds**, the UI will automatically toggle to "Precise Cut" (re-encode) and display a subtle badge: *"Precise Cut Auto-Enabled (Short Clip)"*. This ensures short memes aren't ruined by keyframe drift, while avoiding a 20-minute re-encode on a 3-hour clip unless manually requested.

### Error State Design
The "happy path" is covered, but we must handle failures visually:
- **Proxy/Network Stalls:** If the video buffers for > 5 seconds, display a transparent overlay: *"Buffering stream... (Attempting refresh)"*.
- **`yt-dlp` Fetch Failure:** If `yt-dlp -g` exits with an error (e.g., geoblocked, cookies expired), replace the player with an error block: *"Unable to load visual preview. Please enter timestamps manually."* along with the exact CLI error.
- **FFmpeg Trimming Error:** If the final download/trim fails, the download queue item will glow red, and hovering will display the FFmpeg exit code/stderr.

## 3. Backend Execution

When downloading, the backend command builder will:
1. Append `--download-sections "*[START]-[END]"`.
2. Append `--ffmpeg-location <path>`. We will use `ffmpeg-static` and ensure it is unpacked via `asarUnpack: ["**/node_modules/ffmpeg-static/**/*"]` in `electron-builder.yml`.
3. If Precise Cut is enabled, append `--force-keyframes-at-cuts`.

## Proposed Next Steps for Execution

If this plan is approved, I will begin execution in this order:
1. **Infrastructure:** Install `hls.js` and `ffmpeg-static`, and configure `electron-builder.yml` for unpacking.
2. **Backend Proxy:** Implement the secure `ytforge://` protocol in the main process with the SSRF allowlist.
3. **Player Component:** Build the layered player (Iframe + `hls.js` fallback) with the auto-refresh logic.
4. **Trimmer UI:** Build the inline dual-slider UI with the robust timestamp parser and auto-precision toggle.
5. **Download Integration:** Hook the UI values into the `yt-dlp` download command builder.

Let me know if you approve this plan to begin execution!
