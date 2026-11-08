# lap-sim-vr

This is the VR half of a DIY laparoscopic cholecystectomy trainer. The surgeon wears a **Meta Quest 3 / 3S** and stands in a virtual operating room. The **live feed from the camera inside the box trainer** plays on the big laparoscopy monitor, just as in a real lap case. A human "director" (and later, AI agents) can trigger complications: blood flooding the view, cautery smoke, a red warning banner, crashing vitals, and OR staff talking.

It's a plain WebXR web app (three.js), so there's nothing to install on the headset. You open a URL in the Quest Browser and press **Enter VR**.

```
 box trainer                 laptop / Pi                         Quest 3
┌──────────────┐  CSI/USB  ┌────────────────────────────┐ WebRTC ┌──────────────────────┐
│ camera ──────┼──────────►│ MediaMTX  (:8889 WHEP)     │───────►│ Quest Browser        │
│ sponge liver │           │ lap-sim-vr server (:8787)  │  wss   │  OR scene + monitor  │
│ balloon GB   │           │   /ws  /api/events  /mediamtx◄──────►│  overlays, vitals    │
└──────────────┘           └───────────▲────────────────┘        └──────────────────────┘
                                       │ ws / REST JSON events
                         director panel (/control.html), future AI agents, Pi pump/servo daemons
```

| Page | What |
|---|---|
| `/` | The VR operating room. Open it on the Quest. |
| `/control.html` | Director panel: bleed, smoke, warning, vitals, voices, feed source |
| `/sender.html` | Laptop-webcam sender (publishes the webcam to MediaMTX over WebRTC/WHIP) |
| `/api/events` | `POST` one event or an array of events (for agents and scripts) |
| `/api/state`, `/api/schema`, `/api/config` | Current scenario state, JSON Schema of events, and video config |

## Quick start (laptop + USB webcam, everything on one machine)

You need Node 20+ and a laptop on the same Wi-Fi as the Quest.

```bash
npm install
npm run mediamtx      # terminal 1: downloads MediaMTX once, runs laptop/mediamtx.yml
npm run dev           # terminal 2: event server :8787 + Vite HTTPS dev server :5173
```

1. On the laptop, open `https://localhost:5173/sender.html`, pick the USB webcam (the one inside the box) and click **Start sending**.
2. On the Quest, open `https://<laptop-LAN-IP>:5173/`. Vite prints the address under "Network". Accept the certificate warning (**Advanced → Proceed**). The page is now a secure context, so WebXR works.
3. The monitor label switches from `DEMO` to `LIVE · box camera`. Press **Enter VR**.
4. On the laptop (or a phone), open `https://<laptop-LAN-IP>:5173/control.html` and play director.

If no camera is publishing, the monitor plays the demo lap-chole clip (`source: auto`). The same happens if the camera drops.

### Webcam via ffmpeg instead of the browser

Use this to run headless or to get lower latency. Publish to MediaMTX's RTSP port, path `cam`:

```bash
# macOS
ffmpeg -f avfoundation -framerate 30 -video_size 1280x720 -i "0" \
  -c:v libx264 -preset ultrafast -tune zerolatency -g 30 -bf 0 -b:v 3M -pix_fmt yuv420p -f rtsp rtsp://localhost:8554/cam
# Linux
ffmpeg -f v4l2 -input_format mjpeg -video_size 1280x720 -framerate 30 -i /dev/video0 \
  -c:v libx264 -preset ultrafast -tune zerolatency -g 30 -bf 0 -b:v 3M -pix_fmt yuv420p -f rtsp rtsp://localhost:8554/cam
# Windows (list cameras: ffmpeg -list_devices true -f dshow -i dummy)
ffmpeg -f dshow -video_size 1280x720 -framerate 30 -i video="USB Camera" ^
  -c:v libx264 -preset ultrafast -tune zerolatency -g 30 -bf 0 -b:v 3M -pix_fmt yuv420p -f rtsp rtsp://localhost:8554/cam
```

You can also uncomment `runOnInit` in `laptop/mediamtx.yml` so MediaMTX starts ffmpeg itself.

## Raspberry Pi 5 camera setup

**Hardware:** Raspberry Pi 5 (4 GB is plenty), official 27 W USB-C PSU, a camera, and a **Pi 5 camera cable** (22-pin to 15-pin "mini" FPC; the Pi 5 uses the smaller connector, so older Pi 4 cables don't fit).

Camera choice:

- **Camera Module 3 *Wide*** (~US$35, 120° FOV, autofocus) is the best fit. A wide FOV mimics a laparoscope, and autofocus handles the 5–25 cm working distance in a bin. The standard (non-wide) Camera Module 3 also works but sees less.
- Fixed-focus modules (Camera Module 2, cheap OV5647) are often focused at infinity and will be blurry at 10 cm. You'd have to twist the lens to refocus.
- **Light:** the box is dark. Add a small LED ring or strip next to the camera (5 V USB LED strip, or a 12 V strip with a buck converter). Diffuse it with tape or paper to avoid glare on the wet balloon.
- Mount the camera at a laparoscope-like angle, looking down at about 30–45° from one end of the bin. Use `rpiCameraHFlip/VFlip` in the config if the image is mirrored.

**Software** (Raspberry Pi OS Bookworm 64-bit, Pi on the same LAN as the Quest):

```bash
sudo apt update && sudo apt install -y rpicam-apps git
rpicam-hello --list-cameras          # the camera must be listed
git clone <this repo> && cd lap-sim-vr
./pi/setup.sh                        # installs MediaMTX + systemd service with pi/mediamtx.yml
```

This runs MediaMTX's built-in `rpiCamera` source (libcamera, the same stack as `rpicam-vid`) at 1280×720/30 fps, H.264, keyframe every second. The Pi 5 has no hardware H.264 encoder, so encoding is in software. 720p30 is comfortable; 1080p works but adds CPU load and latency. Check the stream at `http://<pi-ip>:8889/cam` (MediaMTX's own WebRTC page).

Run the lap-sim-vr server either **on the laptop**, pointing at the Pi:

```bash
MEDIAMTX_URL=http://<pi-ip>:8889 npm run dev
```

**or on the Pi itself** (install Node 20+, e.g. `sudo apt install -y nodejs npm` or from NodeSource):

```bash
npm install && npm run build && npm run cert
HTTPS=1 PORT=8443 npm start          # then open https://<pi-ip>:8443/ on the Quest
```

The server only proxies the WebRTC *signalling* (`/mediamtx/*`). The video itself goes peer-to-peer from MediaMTX to the headset over the LAN (UDP 8189). If the Quest shows `camera: …` errors, open UDP 8189 / TCP 8889 on the Pi's firewall. If the Pi has several interfaces, set `webrtcAdditionalHosts: [<pi-ip>]` in `pi/mediamtx.yml`.

## Running the server

| Command | What |
|---|---|
| `npm run dev` | Event server on :8787 + Vite dev server with HTTPS (self-signed, `@vitejs/plugin-basic-ssl`) on :5173. Use this day to day. |
| `npm run build && npm start` | Production: the server serves `dist/` over **HTTP** on :8787. Use behind a TLS proxy or tunnel. |
| `npm run cert && npm run build && npm run start:https` | Production over **HTTPS** on :8443 with a self-signed cert covering this machine's LAN IPs. |
| `npm run mediamtx [-- pi/mediamtx.yml]` | Download and run MediaMTX for this OS. |

Environment variables: `PORT`, `HOST`, `HTTPS=1`, `CERT_FILE`/`KEY_FILE` (e.g. from mkcert), `MEDIAMTX_URL` (default `http://127.0.0.1:8889`), `CAMERA_PATH` (default `cam`), `DEFAULT_SOURCE` (`auto` | `live` | `demo`).

### HTTPS on the LAN (WebXR needs a secure context)

- **Easiest:** use the self-signed certs (`npm run dev`, or `npm run cert` + `start:https`). The Quest Browser shows a warning once; tap **Advanced → Proceed** and WebXR works.
- **No warning:** use [mkcert](https://github.com/FiloSottile/mkcert). Run `mkcert -install && mkcert <laptop-ip> localhost`, then `CERT_FILE=./<ip>+1.pem KEY_FILE=./<ip>+1-key.pem HTTPS=1 PORT=8443 npm start`. To get no warning on the Quest you must also install mkcert's `rootCA.pem` on the headset (Settings → Security → Credentials). That isn't always available, so clicking through is usually simpler.
- **Remote / no LAN:** any HTTPS tunnel (Cloudflare Tunnel, ngrok, Replicas preview) in front of `npm start` works for the scene, director panel and demo video. Live WebRTC video still needs the headset to reach MediaMTX directly (same LAN), or a TURN server.

## Opening it on the Quest

1. Put the Quest on the same Wi-Fi as the laptop or Pi.
2. Open the Quest Browser and go to the URL (tip: open the director panel on your phone and use **VR view ↗** to send the link, or type it once and bookmark it).
3. Accept the certificate warning if shown.
4. Press **Enter VR**. You're standing on the patient's left at the OR table. The laparoscopy monitor is across the table, and the anaesthesia monitor is at the head end.
5. **Recenter:** squeeze either grip button. This puts the surgeon spot where you're standing, facing where you're looking. You can also hold the Meta button to recenter the headset.
6. Audio (pulse-ox beep, alarms, staff voices) starts once you've entered VR or tapped the page.

Your hands will be on the real instruments, so you can put the controllers down. Hand tracking may show nothing, and that's expected.

Useful URL flags: `?source=demo|live|auto`, `?whep=<url>` (WHEP override), `?monitorWidth=1.8`, `?controllers=0`, `?emulate=1[&devui=1]` (IWER Quest-3 emulation on a desktop browser), `?clean=1` (hide the 2D status box).

## Event schema (for the director panel, AI agents and hardware)

Connect a WebSocket to `wss://<host>/ws` and send `{"type":"hello","role":"agent","name":"anesthesia-bot"}`. Then send events as JSON. Every client receives every event, with `id`, `ts` (ms) and `from` (the sender's role) added. A new client first receives `{"type":"state", ...}` with the current scenario. Without a socket, `POST /api/events` with one event or an array:

```bash
curl -k https://localhost:5173/api/events -H 'content-type: application/json' \
  -d '[{"type":"bleed","intensity":0.8},{"type":"say","speaker":"Anesthesia","text":"Pressure is dropping"}]'
```

The full JSON Schema is at `schema/events.schema.json` (also `GET /api/schema`). Invalid events are rejected with an error.

| type | fields | effect |
|---|---|---|
| `bleed` | `intensity` 0–1 (0 = stop/suction), `origin` `{x,y}` 0–1 screen coords (default `{0.62,0.38}`), `pulsatile` bool (default true) | Blood pools from the origin and runs down. Arterial bleeds spurt in time with the heart rate. High intensity darkens and reddens the whole view. |
| `smoke` | `intensity` 0–1 (default 0.7), `durationMs` (default 8000, 0 = until cleared) | Cautery smoke / lens fog with heat shimmer and blur |
| `warning` | `text`, `level` `critical`\|`warning`\|`info`, `durationMs` (0 = until cleared) | Banner across the top of the lap monitor. Critical blinks. |
| `clear` | `target` `all`\|`bleed`\|`smoke`\|`warning`\|`captions` | Remove overlays |
| `vitals` | any of `hr`, `bp` (`"120/80"`), `spo2`, `rr`, `etco2`, `temp`, `transitionMs` (default 3000) | Anaesthesia monitor values glide to the new targets. Alarms flash and sound when out of range (SpO2 <90, HR >120/<50, SBP <90/>180, EtCO2 >50). The pulse-ox beep pitch drops with SpO2. |
| `say` | `speaker`, `text`, optional `audioUrl`, `voice` | Caption under the lap monitor, spoken with the browser's speech synthesis or by playing `audioUrl` (for agent-generated TTS) |
| `source` | `mode` `live`\|`demo`\|`auto`, optional `whep` | Switch the laparoscope feed |
| `actuator` | `device` (e.g. `pump.bleed`, `servo.liver`), `value`, `durationMs` | **Hook only.** Forwarded to `role: "hardware"` clients (future Pi pump/servo daemons). See `hardware/actuator_client.py`. |
| `reset` | – | Clear everything and return vitals to baseline |

Server → client only: `state`, `presence` (connected roles), `history` (to directors), `error`.

## Testing without a headset

`tests/` uses [Playwright](https://playwright.dev) + Meta's [IWER](https://github.com/meta-quest/immersive-web-emulation-runtime) to emulate a Quest 3 in headless Chrome. The tests enter a real `immersive-vr` session, send events through the REST API and screenshot the in-headset view:

```bash
npm run build && npm start &            # server on :8787
npm run test:screens                    # artifacts/01..08 *.png
npm run mediamtx & ffmpeg -re -stream_loop -1 -i client/public/media/demo-lap-chole.mp4 \
  -c:v libx264 -preset ultrafast -tune zerolatency -f rtsp rtsp://localhost:8554/cam &
node tests/live.mjs                     # verifies MediaMTX -> WHEP proxy -> VR monitor shows LIVE
node tests/record-demo.mjs              # director panel + VR view side by side -> artifacts/demo.webm
```

For interactive testing on a desktop, open `/?emulate=1&devui=1` to get IWER's DevUI (move the emulated headset and controllers).

## Project layout

```
client/            Vite root
  index.html       VR view          src/main.js      scene setup, events, XR
  control.html     director panel   src/or.js        OR set dressing (HDRI room, table, drapes, lights, tower, props)
  sender.html      webcam sender    src/monitor.js   lap monitor + overlay shader
  public/vendor/   MediaMTX reader.js / publisher.js (MIT)
  public/assets/   HDRI + glTF props        src/vitals.js   anaesthesia monitor
  public/media/    demo clip                src/audio.js    beeps, alarms, TTS, captions
server/index.js    event hub (ws + REST), MediaMTX signalling proxy, static hosting
schema/            JSON Schema for events
pi/                MediaMTX config + setup script for Raspberry Pi 5
laptop/            MediaMTX config for a laptop webcam
hardware/          stub hardware client for future pumps/servos
docs/prior-art.md  what we looked at and reused
```

## Credits and licenses

Code: MIT. Third-party assets (all free to reuse):

- **OR room / lighting:** ["Surgery" HDRI](https://polyhaven.com/a/surgery) by Oliksiy Yakovlyev, [Poly Haven](https://polyhaven.com), **CC0**. Tonemapped to JPG for the visible room; the 1k HDR is used for lighting.
- **Props:** [Metal Stool 01](https://polyhaven.com/a/metal_stool_01) by Ulan Cabanilla, [Metal Trash Can](https://polyhaven.com/a/metal_trash_can) by GurJas Studios, Poly Haven, **CC0** (re-packed to GLB/WebP with glTF-Transform). Side table and keyboard from the [Furniture Kit](https://kenney.nl/assets/furniture-kit) by [Kenney](https://kenney.nl), **CC0**.
- **Demo laparoscope video:** Boer J, Boerma D, de Vries Reilingh T. *A gallbladder torsion presenting as acute cholecystitis in an elderly woman: a case report.* J Med Case Reports 2011;5:588. [Video via Wikimedia Commons](https://commons.wikimedia.org/wiki/File:A-gallbladder-torsion-presenting-as-acute-cholecystitis-in-an-elderly-woman-A-case-report-1752-1947-5-588-S1.ogv), **CC BY 2.0**. Cropped and transcoded to H.264.
- **Libraries:** [three.js](https://threejs.org) (MIT), [IWER / @iwer/devui](https://github.com/meta-quest/immersive-web-emulation-runtime) (MIT, Meta), [MediaMTX](https://github.com/bluenviron/mediamtx) incl. vendored `reader.js`/`publisher.js` (MIT), [ws](https://github.com/websockets/ws), [Express](https://expressjs.com), [Ajv](https://ajv.js.org), [Vite](https://vite.dev).
- The OR table, draped patient, surgical lights, laparoscopy tower, IV pole and back table are procedural (`client/src/or.js`).

This is a training aid for a physical box trainer, not a medical device.
